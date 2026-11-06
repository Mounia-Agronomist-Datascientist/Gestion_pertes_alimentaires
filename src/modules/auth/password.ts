import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/** Longueur minimale des mots de passe (docs/SECURITE.md §3). */
export const MIN_PASSWORD_LENGTH = 10;

export class PasswordPolicyError extends Error {}

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
  }
}

/** Hachage Argon2id (paramètres par défaut de la bibliothèque, conformes aux recommandations OWASP). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Vérification factice quand l'identifiant n'existe pas : le temps de réponse reste le même,
 * ce qui empêche de deviner les identifiants valides.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hash(randomBytes(16).toString("hex"));
  await verifyPassword(await dummyHash, password);
  return false;
}

/** Mot de passe aléatoire lisible (sans caractères ambigus), pour les comptes créés par l'administrateur. */
export function generatePassword(length = 12): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
