"use server";

import { db } from "@/db/client";
import { DestinationError } from "@/domain/destinations";
import { TareError } from "@/domain/tares";
import { QuantityError } from "@/domain/unites";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { type CreatedDeclaration, createDeclaration, DeclarationError } from "@/modules/declarations/service";

export type SubmitResult = { ok: true; declaration: CreatedDeclaration } | { ok: false; error: string };

const USER_ERRORS = [DeclarationError, TareError, QuantityError, DestinationError, ForbiddenError];

export async function submitDeclaration(payload: unknown): Promise<SubmitResult> {
  const user = await requireUser();
  try {
    return { ok: true, declaration: await createDeclaration(db, user, payload) };
  } catch (e) {
    if (USER_ERRORS.some((E) => e instanceof E)) return { ok: false, error: (e as Error).message };
    console.error("Échec d'enregistrement d'une déclaration", e);
    return { ok: false, error: "Erreur inattendue : la perte n'a pas été enregistrée. Réessayez." };
  }
}
