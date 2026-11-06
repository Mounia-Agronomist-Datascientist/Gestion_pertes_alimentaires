"use server";

import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import {
  BatchLineError,
  type CreatedDeclaration,
  correctDeclaration,
  createDeclaration,
  createDeclarationBatch,
  isInputError,
} from "@/modules/declarations/service";

export type SubmitResult = { ok: true; declaration: CreatedDeclaration } | { ok: false; error: string };

async function run(action: () => Promise<CreatedDeclaration>): Promise<SubmitResult> {
  try {
    return { ok: true, declaration: await action() };
  } catch (e) {
    if (isInputError(e)) return { ok: false, error: e.message };
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

export type BatchResult = { ok: true; count: number } | { ok: false; error: string; lineIndex: number | null };

export async function submitBatch(payloads: unknown[]): Promise<BatchResult> {
  const user = await requireUser();
  try {
    const created = await createDeclarationBatch(db, user, payloads);
    return { ok: true, count: created.length };
  } catch (e) {
    if (e instanceof BatchLineError) return { ok: false, error: e.message, lineIndex: e.lineIndex };
    if (isInputError(e)) return { ok: false, error: e.message, lineIndex: null };
    console.error("Échec d'enregistrement d'un lot de déclarations", e);
    return { ok: false, error: "Erreur inattendue : rien n'a été enregistré. Réessayez.", lineIndex: null };
  }
}
