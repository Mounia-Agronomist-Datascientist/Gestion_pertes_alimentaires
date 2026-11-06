"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { AdminError, createAccountByAdmin, resetPassword, setAccountActive } from "@/modules/admin/accounts";
import { createCause, reviewCause, setCauseActive, updateCause } from "@/modules/admin/causes";
import { setTeamWeekActive } from "@/modules/admin/teams";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";

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
