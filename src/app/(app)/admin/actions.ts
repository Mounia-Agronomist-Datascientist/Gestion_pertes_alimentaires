"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { AdminError, createAccountByAdmin, resetPassword, setAccountActive } from "@/modules/admin/accounts";
import { createCause, reviewCause, setCauseActive, updateCause } from "@/modules/admin/causes";
import { setContainerActive, setContainerMaxCount, setContainerTare } from "@/modules/admin/containers";
import {
  createDestination,
  createSubzone,
  moveDestination,
  moveSubzone,
  renameZone,
  setDestinationActive,
  setSubzoneActive,
  updateDestination,
  updateSubzone,
} from "@/modules/admin/places";
import { setProductionDay } from "@/modules/admin/production-days";
import { createProduct, linkUnlistedGroup, setProductActive, updateProduct } from "@/modules/admin/products";
import { setTeamWeekActive } from "@/modules/admin/teams";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { DeclarationError } from "@/modules/declarations/service";

export interface AccountActionState {
  error?: string;
  message?: string;
  /** Mot de passe provisoire, affiché une seule fois. */
  password?: string;
  login?: string;
}

export async function accountAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const admin = await requireUser();
  const intent = String(formData.get("intent"));
  try {
    if (intent === "create") {
      const login = String(formData.get("login") ?? "").trim().toLowerCase();
      const { password } = await createAccountByAdmin(db, admin, {
        login,
        displayName: formData.get("displayName"),
        roleCode: formData.get("roleCode"),
        teamId: formData.get("teamId") || null,
        zoneIds: formData.getAll("zoneIds").map(String),
      });
      revalidatePath("/admin/comptes");
      return { message: `Compte « ${login} » créé.`, password, login };
    }
    const userId = String(formData.get("userId"));
    const login = String(formData.get("login"));
    if (intent === "reset") {
      const password = await resetPassword(db, admin, userId);
      revalidatePath("/admin/comptes");
      return { message: `Mot de passe de « ${login} » réinitialisé ; ses appareils ont été déconnectés.`, password, login };
    }
    if (intent === "activate" || intent === "deactivate") {
      await setAccountActive(db, admin, userId, intent === "activate");
      revalidatePath("/admin/comptes");
      return { message: `Compte « ${login} » ${intent === "activate" ? "réactivé" : "désactivé"}.` };
    }
    return { error: "Action inconnue" };
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

export async function teamWeekAction(formData: FormData): Promise<void> {
  const admin = await requireUser();
  await setTeamWeekActive(db, admin, {
    teamId: String(formData.get("teamId")),
    productionWeekId: String(formData.get("weekId")),
    active: formData.get("active") === "1",
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/admin/equipes");
}

export async function productionDayAction(formData: FormData): Promise<void> {
  const admin = await requireUser();
  await setProductionDay(db, admin, {
    day: String(formData.get("day")),
    isProductionDay: formData.get("production") === "1",
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/admin/calendrier");
}

// ─── Causes ──────────────────────────────────────────────────────────────────

export interface CauseActionState {
  error?: string;
  message?: string;
}

export async function causeAction(_prev: CauseActionState, formData: FormData): Promise<CauseActionState> {
  const admin = await requireUser();
  const intent = String(formData.get("intent"));
  const causeId = String(formData.get("causeId") ?? "");
  const fields = () => ({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    zoneIds: formData.getAll("zoneIds").map(String),
  });
  try {
    switch (intent) {
      case "create":
        await createCause(db, admin, fields());
        break;
      case "update":
        await updateCause(db, admin, causeId, fields());
        break;
      case "accept":
        await reviewCause(db, admin, causeId, { accept: true, ...fields() });
        break;
      case "reject":
        await reviewCause(db, admin, causeId, { accept: false, reason: String(formData.get("reason") ?? "") });
        break;
      case "activate":
      case "deactivate":
        await setCauseActive(db, admin, causeId, intent === "activate");
        break;
      default:
        return { error: "Action inconnue" };
    }
    revalidatePath("/admin/causes");
    const labels: Record<string, string> = {
      create: "Cause créée.",
      update: "Cause modifiée. Les déclarations passées gardent l'ancien nom.",
      accept: "Proposition validée : la cause est maintenant proposée aux équipes.",
      reject: "Proposition rejetée.",
      activate: "Cause réactivée.",
      deactivate: "Cause désactivée : elle n'est plus proposée.",
    };
    return { message: labels[intent] };
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

// ─── Produits ────────────────────────────────────────────────────────────────

export interface ProductActionState {
  error?: string;
  message?: string;
}

export async function productAction(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const admin = await requireUser();
  const intent = String(formData.get("intent"));
  const productId = String(formData.get("productId") ?? "");
  const groupKey = String(formData.get("groupKey") ?? "");
  const fields = () => ({
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "") as never,
    code: String(formData.get("code") ?? ""),
    variant: String(formData.get("variant") ?? ""),
    defaultUnit: String(formData.get("defaultUnit") ?? ""),
    unitWeightKg: String(formData.get("unitWeightKg") ?? ""),
    densityKgPerL: String(formData.get("densityKgPerL") ?? ""),
  });
  let message: string;
  try {
    switch (intent) {
      case "create":
        message = `Produit « ${(await createProduct(db, admin, fields())).name} » créé.`;
        break;
      case "update":
        await updateProduct(db, admin, productId, fields());
        message = "Produit modifié. Les déclarations passées gardent l'ancien nom.";
        break;
      case "activate":
      case "deactivate":
        await setProductActive(db, admin, productId, intent === "activate");
        message = intent === "activate" ? "Produit réactivé." : "Produit désactivé : il n'est plus proposé.";
        break;
      case "link": {
        if (!productId) return { error: "Choisissez le produit de la liste" };
        const n = await linkUnlistedGroup(db, admin, groupKey, productId);
        message = `${n} saisie${n > 1 ? "s rattachées" : " rattachée"} au produit.`;
        break;
      }
      case "create_link": {
        const product = await createProduct(db, admin, fields());
        const n = await linkUnlistedGroup(db, admin, groupKey, product.id);
        message = `Produit « ${product.name} » créé ; ${n} saisie${n > 1 ? "s rattachées" : " rattachée"}.`;
        break;
      }
      default:
        return { error: "Action inconnue" };
    }
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError || e instanceof DeclarationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/produits");
  return { message };
}

// ─── Gastros et tares ────────────────────────────────────────────────────────

export interface TareActionState {
  error?: string;
  message?: string;
}

export async function tareAction(_prev: TareActionState, formData: FormData): Promise<TareActionState> {
  const admin = await requireUser();
  const intent = String(formData.get("intent"));
  const containerTypeId = String(formData.get("containerTypeId") ?? "");
  const name = String(formData.get("name") ?? "");
  let message: string;
  try {
    switch (intent) {
      case "tare": {
        const tare = await setContainerTare(db, admin, {
          containerTypeId,
          unitTareKg: String(formData.get("unitTareKg") ?? ""),
          validFrom: String(formData.get("validFrom") ?? ""),
          note: String(formData.get("note") ?? ""),
        });
        message = `${name} : ${tare.unitTareKg.toLocaleString("fr-FR")} kg à partir du ${new Date(`${tare.validFrom}T12:00:00Z`).toLocaleDateString("fr-FR")}.`;
        break;
      }
      case "max":
        await setContainerMaxCount(db, admin, containerTypeId, formData.get("maxCount"));
        message = `${name} : nombre maximum enregistré.`;
        break;
      case "activate":
      case "deactivate":
        await setContainerActive(db, admin, containerTypeId, intent === "activate");
        message = intent === "activate" ? `${name} réactivé.` : `${name} désactivé : il n'est plus proposé à la saisie.`;
        break;
      default:
        return { error: "Action inconnue" };
    }
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/tares");
  return { message };
}

// ─── Destinations, zones et postes ───────────────────────────────────────────

export interface PlaceActionState {
  error?: string;
  message?: string;
}

export async function destinationAction(_prev: PlaceActionState, formData: FormData): Promise<PlaceActionState> {
  const admin = await requireUser();
  const intent = String(formData.get("intent"));
  const id = String(formData.get("id") ?? "");
  const fields = () => ({
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? "") as never,
    financialRecovery: formData.get("financialRecovery") === "on",
  });
  let message: string | undefined;
  try {
    switch (intent) {
      case "create":
        message = `Destination « ${(await createDestination(db, admin, fields())).name} » créée.`;
        break;
      case "update":
        await updateDestination(db, admin, id, fields());
        message = "Destination modifiée.";
        break;
      case "activate":
      case "deactivate":
        await setDestinationActive(db, admin, id, intent === "activate");
        message = intent === "activate" ? "Destination réactivée." : "Destination désactivée : elle n'est plus proposée.";
        break;
      case "up":
      case "down":
        await moveDestination(db, admin, id, intent);
        break;
      default:
        return { error: "Action inconnue" };
    }
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/destinations");
  return { message };
}

export async function zoneAction(_prev: PlaceActionState, formData: FormData): Promise<PlaceActionState> {
  const admin = await requireUser();
  const intent = String(formData.get("intent"));
  const id = String(formData.get("id") ?? "");
  const fields = () => ({ name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? "") });
  let message: string | undefined;
  try {
    switch (intent) {
      case "rename_zone":
        await renameZone(db, admin, id, formData.get("name"));
        message = "Zone renommée.";
        break;
      case "create":
        message = `Poste « ${(await createSubzone(db, admin, String(formData.get("zoneId")), fields())).name} » créé.`;
        break;
      case "update":
        await updateSubzone(db, admin, id, fields());
        message = "Poste modifié.";
        break;
      case "activate":
      case "deactivate":
        await setSubzoneActive(db, admin, id, intent === "activate");
        message = intent === "activate" ? "Poste réactivé." : "Poste désactivé : il n'est plus proposé.";
        break;
      case "up":
      case "down":
        await moveSubzone(db, admin, id, intent);
        break;
      default:
        return { error: "Action inconnue" };
    }
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/zones");
  return { message };
}
