/**
 * Doublons probables (décision du 26/11/2026) : avant de valider, la saisie signale une perte du même produit, au
 * même endroit (même équipe en Cuisine, même zone ailleurs), le même jour. On prévient, puis on laisse valider.
 */
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { AuthUser } from "@/modules/auth/permissions";
import { displayLabel } from "@/modules/imports/catalog";

const uuid = z.uuid();
const inputSchema = z.object({
  occurredOn: z.iso.date(),
  subzoneId: uuid,
  teamId: uuid.nullable().optional(),
  product: z.union([
    z.object({ productId: uuid }),
    z.object({ weekItem: z.object({ kind: z.enum(["plat", "sous_recette", "ingredient"]), id: uuid }) }),
    z.object({ freeLabel: z.string().trim().min(1).max(200) }),
  ]),
  /** Perte en cours de correction : jamais comptée comme son propre doublon. */
  excludeId: uuid.nullable().optional(),
});

export interface SameDayLoss {
  id: string;
  /** Heure de la perte si elle est notée, sinon heure de la saisie (HH:MM, heure de Paris). */
  time: string;
  quantity: number;
  unitCode: string;
  netKg: number | null;
}

/** Même produit : par sa fiche, par le code du plat, le nom de la sous-recette ou de l'ingrédient, ou le nom tapé. */
async function sameProduct(db: Db, product: z.infer<typeof inputSchema>["product"]): Promise<SQL | null> {
  if ("productId" in product) return eq(s.lossDeclarations.productId, product.productId);
  if ("freeLabel" in product) {
    return and(
      eq(s.lossDeclarations.productUnlisted, true),
      sql`lower(${s.lossDeclarations.productName}) = ${product.freeLabel.toLowerCase()}`,
    )!;
  }
  const { kind, id } = product.weekItem;
  if (kind === "plat") {
    const [r] = await db.select({ code: s.weekRecipes.code }).from(s.weekRecipes).where(eq(s.weekRecipes.id, id));
    return r ? eq(s.lossDeclarations.productCode, r.code) : null;
  }
  if (kind === "sous_recette") {
    const [r] = await db
      .select({ name: s.weekSubRecipes.name })
      .from(s.weekSubRecipes)
      .where(eq(s.weekSubRecipes.id, id));
    return r ? and(eq(s.lossDeclarations.productName, r.name), isNull(s.lossDeclarations.productId))! : null;
  }
  const [l] = await db
    .select({ label: s.weekRecipeLines.label })
    .from(s.weekRecipeLines)
    .where(eq(s.weekRecipeLines.id, id));
  return l
    ? and(eq(s.lossDeclarations.productName, displayLabel(l.label)), isNull(s.lossDeclarations.productId))!
    : null;
}

export async function sameDayLosses(db: Db, user: AuthUser, raw: unknown): Promise<SameDayLoss[]> {
  void user;
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return [];
  const input = parsed.data;
  const [subzone] = await db.select().from(s.subzones).where(eq(s.subzones.id, input.subzoneId));
  if (!subzone) return [];
  const product = await sameProduct(db, input.product);
  if (!product) return [];
  const rows = await db
    .select()
    .from(s.lossDeclarations)
    .where(
      and(
        product,
        eq(s.lossDeclarations.occurredOn, input.occurredOn),
        eq(s.lossDeclarations.zoneId, subzone.zoneId),
        inArray(s.lossDeclarations.status, ["validee", "corrigee"]),
        input.teamId ? eq(s.lossDeclarations.teamId, input.teamId) : undefined,
        input.excludeId ? sql`${s.lossDeclarations.id} <> ${input.excludeId}` : undefined,
      ),
    )
    .orderBy(s.lossDeclarations.declaredAt);
  const paris = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  return rows.map((d) => ({
    id: d.id,
    time: d.occurredTime ? d.occurredTime.slice(0, 5) : paris.format(d.declaredAt),
    quantity: d.quantity,
    unitCode: d.unitCode,
    netKg: d.netKg,
  }));
}
