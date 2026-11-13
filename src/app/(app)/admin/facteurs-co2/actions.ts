"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { AdminError } from "@/modules/admin/accounts";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { loadAgribalyseProposal, proposeFactor, rejectFactor, validateFactors } from "@/modules/environnement/factors";
import { type IngredientMappingInput, saveIngredientMappings } from "@/modules/environnement/ingredients";

export interface FactorActionState {
  error?: string;
  message?: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Chargement de la proposition, validation (une ou toutes), refus ou nouvelle valeur d'une famille. */
export async function factorAction(_prev: FactorActionState, formData: FormData): Promise<FactorActionState> {
  const admin = await requireUser();
  const intent = String(formData.get("intent") ?? "");
  try {
    let message: string;
    switch (intent) {
      case "load": {
        const r = await loadAgribalyseProposal(db, admin);
        message = `${plural(r.createdFamilies, "famille")} ${r.createdFamilies > 1 ? "créées" : "créée"}, ${plural(r.proposed, "facteur")} ${r.proposed > 1 ? "proposés" : "proposé"}.`;
        break;
      }
      case "validate": {
        const n = await validateFactors(db, admin, formData.getAll("id").map(String));
        message = `${plural(n, "facteur")} ${n > 1 ? "validés" : "validé"}.`;
        break;
      }
      case "reject":
        await rejectFactor(db, admin, String(formData.get("id") ?? ""));
        message = "Proposition refusée.";
        break;
      case "propose": {
        const value = Number(String(formData.get("kgCo2ePerKg") ?? "").replace(/\s/g, "").replace(",", "."));
        const text = (name: string) => String(formData.get(name) ?? "").trim() || null;
        await proposeFactor(db, admin, String(formData.get("familyId") ?? ""), {
          kgCo2ePerKg: Number.isFinite(value) && String(formData.get("kgCo2ePerKg") ?? "").trim() ? value : Number.NaN,
          source: text("source") ?? "",
          sourceVersion: text("sourceVersion"),
          referenceName: text("referenceName"),
          hypotheses: text("hypotheses") ?? "",
        });
        message = "Nouvelle valeur proposée : elle sera utilisée une fois validée.";
        break;
      }
      default:
        return { error: "Action inconnue" };
    }
    revalidatePath("/admin/facteurs-co2");
    return { message };
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

/** Enregistre des rattachements d'ingrédients (une ligne ou toutes les suggestions affichées). */
export async function ingredientMappingAction(_prev: FactorActionState, formData: FormData): Promise<FactorActionState> {
  const admin = await requireUser();
  let entries: IngredientMappingInput[];
  try {
    entries = JSON.parse(String(formData.get("entries") ?? "[]"));
  } catch {
    return { error: "Données illisibles : rechargez la page" };
  }
  try {
    const n = await saveIngredientMappings(db, admin, entries);
    revalidatePath("/admin/facteurs-co2/ingredients");
    return { message: n ? `${plural(n, "ingrédient")} ${n > 1 ? "rattachés" : "rattaché"}.` : "Aucun changement." };
  } catch (e) {
    if (e instanceof AdminError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
