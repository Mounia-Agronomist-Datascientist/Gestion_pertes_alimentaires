"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { alchimistesPayloadSchema, saveAlchimistesImport } from "@/modules/imports/alchimistes/service";
import { decomptePayloadSchema, saveProductionCount } from "@/modules/imports/decompte/service";
import { buildWeekImport } from "@/modules/imports/merge";
import { importPayloadSchema } from "@/modules/imports/payload";
import { SURPLUS_SOURCE_LABELS, saveSurplusImport, surplusPayloadSchema } from "@/modules/imports/surplus/service";
import { ImportError, saveWeekImport } from "@/modules/imports/service";
import { PurchaseOrderError, type PurchaseOrdersResult, savePurchaseOrders } from "@/modules/matieres/bons-commande";
import { importSnackTome, SnackTomeError, snackTomePayloadSchema } from "@/modules/matieres/encas-tome";

export interface ImportActionState {
  error?: string;
  message?: string;
}

/** Valide l'import : le serveur revérifie les données reçues et refait le rapprochement avant d'enregistrer. */
export async function importWeekAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const admin = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Données d'import illisibles : rechargez la page et déposez à nouveau les fichiers" };
  }
  const parsed = importPayloadSchema.safeParse(raw);
  if (!parsed.success)
    return { error: "Données d'import inattendues : rechargez la page et déposez à nouveau les fichiers" };
  const { tome, plan, ...files } = parsed.data;
  const preview = buildWeekImport(tome, plan);
  try {
    const saved = await saveWeekImport(db, admin, { preview, ...files });
    revalidatePath("/admin/import");
    return {
      message: `Semaine S${preview.week}-${preview.year} importée (version ${saved.version}) : ${preview.recipes.length} plats, ${preview.subRecipes.length} sous-recettes.`,
    };
  } catch (e) {
    if (e instanceof ImportError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

/** Valide le décompte des barquettes produites : forme revérifiée par le serveur avant enregistrement. */
export async function importDecompteAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const admin = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Données illisibles : rechargez la page et déposez à nouveau le fichier" };
  }
  const parsed = decomptePayloadSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données inattendues : rechargez la page et déposez à nouveau le fichier" };
  try {
    const saved = await saveProductionCount(db, admin, parsed.data);
    revalidatePath("/admin/import");
    return {
      message: `Décompte S${parsed.data.week}-${parsed.data.year} enregistré (version ${saved.version}) : ${parsed.data.rows.length} codes, ${saved.total.toLocaleString("fr-FR")} barquettes produites.`,
    };
  } catch (e) {
    if (e instanceof ImportError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

/** Valide le fichier des Alchimistes : collectes revérifiées par le serveur, semaine tirée du calendrier stocké. */
export async function importAlchimistesAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const admin = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Données illisibles : rechargez la page et déposez à nouveau le fichier" };
  }
  const parsed = alchimistesPayloadSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données inattendues : rechargez la page et déposez à nouveau le fichier" };
  try {
    const saved = await saveAlchimistesImport(db, admin, parsed.data);
    revalidatePath("/admin/import");
    return {
      message: `Pesées des Alchimistes enregistrées : ${saved.collections} collectes, ${saved.totalKg.toLocaleString("fr-FR")} kg${
        saved.replaced ? ` (${saved.replaced} collectes déjà enregistrées sur la période remplacées)` : ""
      }.`,
    };
  } catch (e) {
    if (e instanceof ImportError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

/** Valide un fichier de ventes ou de dons des surplus : lignes revérifiées par le serveur, plats Linkee retrouvés dans Melba. */
export async function importSurplusAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const admin = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Données illisibles : rechargez la page et déposez à nouveau le fichier" };
  }
  const parsed = surplusPayloadSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données inattendues : rechargez la page et déposez à nouveau le fichier" };
  try {
    const saved = await saveSurplusImport(db, admin, parsed.data);
    revalidatePath("/admin/import");
    const details = [
      `${saved.entries} ligne${saved.entries > 1 ? "s" : ""}`,
      parsed.data.source === "linkee"
        ? `${saved.matched} plat${saved.matched > 1 ? "s" : ""} retrouvé${saved.matched > 1 ? "s" : ""} dans Melba (poids et coût calculés)`
        : null,
      saved.unmatched
        ? `${saved.unmatched} code${saved.unmatched > 1 ? "s" : ""} plat absent${saved.unmatched > 1 ? "s" : ""} des imports Melba (sans coût)`
        : null,
      saved.outside
        ? `${saved.outside} ligne${saved.outside > 1 ? "s" : ""} hors du calendrier de production (comptée${saved.outside > 1 ? "s" : ""} par date)`
        : null,
      saved.replaced
        ? `${saved.replaced} ligne${saved.replaced > 1 ? "s" : ""} déjà enregistrée${saved.replaced > 1 ? "s" : ""} sur la période remplacée${saved.replaced > 1 ? "s" : ""}`
        : null,
    ].filter(Boolean);
    return { message: `${SURPLUS_SOURCE_LABELS[parsed.data.source]} enregistré : ${details.join(" · ")}.` };
  } catch (e) {
    if (e instanceof ImportError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

export type PurchaseOrdersActionResult = { ok: true; result: PurchaseOrdersResult } | { ok: false; error: string };

/**
 * Enregistre un paquet de bons de commande lus dans le navigateur (docs/PHASE6.md, étape 6.8). Appelée en boucle
 * par l'écran d'import : un dossier entier du Drive part par paquets de 40 bons.
 */
export async function savePurchaseOrdersAction(orders: unknown): Promise<PurchaseOrdersActionResult> {
  const admin = await requireUser();
  try {
    const result = await savePurchaseOrders(db, admin, orders);
    revalidatePath("/admin/import");
    revalidatePath("/admin/produits");
    return { ok: true, result };
  } catch (e) {
    if (e instanceof PurchaseOrderError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

/** PDF Melba des encas : seules les recettes d'encas lues dans le navigateur sont reçues, revérifiées ici. */
export async function importSnackTomeAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const admin = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Données illisibles : rechargez la page et déposez à nouveau le fichier" };
  }
  const parsed = snackTomePayloadSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données inattendues : rechargez la page et déposez à nouveau le fichier" };
  try {
    const r = await importSnackTome(db, admin, parsed.data);
    revalidatePath("/admin/import");
    revalidatePath("/admin/produits");
    const parts = [
      `${r.snacks} encas lus (${r.weeks.join(", ")})`,
      `${r.created} ajouté${r.created > 1 ? "s" : ""} à la liste${r.composites ? ` dont ${r.composites} composé${r.composites > 1 ? "s" : ""}` : ""}`,
      `${r.newPrices} nouveau${r.newPrices > 1 ? "x" : ""} prix`,
      `${r.newWeights} poids mis à jour`,
    ];
    const skipped = r.skipped.length ? ` Semaines hors calendrier, ignorées : ${r.skipped.join(", ")}.` : "";
    return { message: `${parts.join(" · ")}.${skipped}` };
  } catch (e) {
    if (e instanceof SnackTomeError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
