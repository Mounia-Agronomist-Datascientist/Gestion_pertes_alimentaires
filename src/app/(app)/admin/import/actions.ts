"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { decomptePayloadSchema, saveProductionCount } from "@/modules/imports/decompte/service";
import { buildWeekImport } from "@/modules/imports/merge";
import { importPayloadSchema } from "@/modules/imports/payload";
import { ImportError, saveWeekImport } from "@/modules/imports/service";

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
  if (!parsed.success) return { error: "Données d'import inattendues : rechargez la page et déposez à nouveau les fichiers" };
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
