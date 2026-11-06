"use server";

import { db } from "@/db/client";
import { DestinationError } from "@/domain/destinations";
import { TareError } from "@/domain/tares";
import { QuantityError } from "@/domain/unites";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { type CreatedDeclaration, correctDeclaration, createDeclaration, DeclarationError } from "@/modules/declarations/service";

export type SubmitResult = { ok: true; declaration: CreatedDeclaration } | { ok: false; error: string };

const USER_ERRORS = [DeclarationError, TareError, QuantityError, DestinationError, ForbiddenError];

async function run(action: () => Promise<CreatedDeclaration>): Promise<SubmitResult> {
  try {
    return { ok: true, declaration: await action() };
  } catch (e) {
    if (USER_ERRORS.some((E) => e instanceof E)) return { ok: false, error: (e as Error).message };
    console.error("Échec d'enregistrement d'une déclaration", e);
    return { ok: false, error: "Erreur inattendue : rien n'a été enregistré. Réessayez." };
  }
}

export async function submitDeclaration(payload: unknown): Promise<SubmitResult> {
  const user = await requireUser();
  return run(() => createDeclaration(db, user, payload));
}

export async function submitCorrection(input: {
  id: string;
  expectedRevision: number;
  reason: string;
  payload: unknown;
}): Promise<SubmitResult> {
  const user = await requireUser();
  return run(() =>
    correctDeclaration(db, user, input.id, input.payload, { reason: input.reason, expectedRevision: input.expectedRevision }),
  );
}
