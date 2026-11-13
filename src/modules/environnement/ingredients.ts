/**
 * Rattachement des ingrédients du tome Melba aux familles alimentaires (docs/PHASE5.md, étape 5.5).
 *
 * La liste vient des recettes des imports en vigueur (lignes qui ne sont pas des sous-recettes), classée par
 * nombre d'utilisations : on commence par les ingrédients les plus fréquents. La suggestion par mot-clé n'est
 * jamais enregistrée sans validation.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type IngredientSuggestion, suggestFamily } from "@/domain/ingredients-familles";
import { AdminError } from "@/modules/admin/accounts";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";

export interface IngredientRow {
  key: string;
  label: string;
  /** Lignes de recette qui l'utilisent dans les imports en vigueur. */
  uses: number;
  mapping: { status: "famille" | "non_couvert" | "non_alimentaire"; familyId: string | null; decidedAt: Date } | null;
  suggestion: (IngredientSuggestion & { familyId?: string }) | null;
}

export async function listIngredientsForMapping(db: Db, admin: AuthUser): Promise<IngredientRow[]> {
  requirePermission(admin, "referentiel.manage");
  const [used, mappings, families] = await Promise.all([
    db
      .select({ key: s.weekRecipeLines.key, label: sql<string>`max(${s.weekRecipeLines.label})`, uses: sql<number>`count(*)::int` })
      .from(s.weekRecipeLines)
      .innerJoin(s.weeklyImports, eq(s.weeklyImports.id, s.weekRecipeLines.importId))
      .where(and(eq(s.weeklyImports.status, "validee"), eq(s.weekRecipeLines.isSubRecipe, false)))
      .groupBy(s.weekRecipeLines.key),
    db.select().from(s.ingredientFamilies),
    db.select({ id: s.foodFamilies.id, code: s.foodFamilies.code }).from(s.foodFamilies).where(eq(s.foodFamilies.active, true)),
  ]);
  const familyOf = new Map(families.map((f) => [f.code, f.id]));
  const mappingOf = new Map(mappings.map((m) => [m.ingredientKey, m]));
  const rows = new Map<string, IngredientRow>();
  const add = (key: string, label: string, uses: number) => {
    const m = mappingOf.get(key);
    const suggestion = suggestFamily(key);
    rows.set(key, {
      key,
      label,
      uses,
      mapping: m ? { status: m.status, familyId: m.familyId, decidedAt: m.decidedAt } : null,
      // Une suggestion vers une famille absente (proposition non chargée) n'est pas proposée.
      suggestion: suggestion?.kind === "famille" ? (familyOf.has(suggestion.code) ? { ...suggestion, familyId: familyOf.get(suggestion.code) } : null) : suggestion,
    });
  };
  for (const u of used) add(u.key, u.label, u.uses);
  // Ingrédients déjà rattachés qui ne figurent plus dans les imports en vigueur : gardés dans la liste.
  for (const m of mappings) if (!rows.has(m.ingredientKey)) add(m.ingredientKey, m.label, 0);
  return [...rows.values()].sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label, "fr"));
}

const entrySchema = z
  .object({
    key: z.string().min(1).max(300),
    label: z.string().min(1).max(300),
    status: z.enum(["famille", "non_couvert", "non_alimentaire"]),
    familyId: z.uuid().nullable(),
  })
  .refine((e) => (e.status === "famille") === (e.familyId != null), { message: "Choisissez une famille" });
export type IngredientMappingInput = z.input<typeof entrySchema>;

/** Enregistre des rattachements (nouveaux ou modifiés), chacun tracé dans le journal. */
export async function saveIngredientMappings(db: Db, admin: AuthUser, raw: readonly IngredientMappingInput[], now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const parsed = z.array(entrySchema).max(1000).safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const entries = parsed.data;
  if (!entries.length) return 0;
  const familyIds = [...new Set(entries.map((e) => e.familyId).filter((id): id is string => id != null))];
  if (familyIds.length) {
    const found = await db.select({ id: s.foodFamilies.id }).from(s.foodFamilies).where(inArray(s.foodFamilies.id, familyIds));
    if (found.length !== familyIds.length) throw new AdminError("Famille introuvable : rechargez la page");
  }
  return db.transaction(async (tx) => {
    const before = new Map(
      (await tx.select().from(s.ingredientFamilies).where(inArray(s.ingredientFamilies.ingredientKey, entries.map((e) => e.key)))).map((m) => [m.ingredientKey, m]),
    );
    let changed = 0;
    for (const e of entries) {
      const previous = before.get(e.key);
      if (previous && previous.status === e.status && previous.familyId === e.familyId) continue;
      const values = { label: e.label, status: e.status, familyId: e.familyId, decidedBy: admin.id, decidedAt: now };
      const [saved] = await tx
        .insert(s.ingredientFamilies)
        .values({ ingredientKey: e.key, ...values })
        .onConflictDoUpdate({ target: s.ingredientFamilies.ingredientKey, set: values })
        .returning();
      await writeAudit(tx, {
        userId: admin.id,
        action: previous ? "update" : "create",
        entity: "ingredient_family",
        entityId: saved!.id,
        before: previous ? { status: previous.status, familyId: previous.familyId } : null,
        after: { ingredient: e.label, status: e.status, familyId: e.familyId },
        occurredAt: now,
      });
      changed++;
    }
    return changed;
  });
}
