/**
 * Données envoyées par l'écran d'import : les fichiers sont lus dans le navigateur, seul leur contenu lu
 * (tome et onglet du plan) est transmis. Le serveur en vérifie la forme puis refait le rapprochement lui-même.
 */
import { z } from "zod";

const finite = z.number().finite();
const quantity = z.object({ quantity: finite, unit: z.string().max(80), cost: finite.nullable() });
const line = quantity.extend({
  label: z.string().min(1).max(300),
  key: z.string().max(300),
  isSubRecipe: z.boolean(),
  unitWeightG: finite.nullable(),
});

const tomeSchema = z.object({
  recipes: z
    .array(
      z.object({
        year: z.number().int().min(2000).max(2100),
        week: z.number().int().min(1).max(53),
        code: z.string().regex(/^[A-Z]{2,3}\d{2,3}(?:_[A-Z]{2,3})?$/),
        name: z.string().min(1).max(300),
        portionWeightG: finite.nullable(),
        lines: z.array(line).max(200),
        total: quantity.nullable(),
        page: z.number().int(),
      }),
    )
    .max(500),
  subRecipes: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        key: z.string().min(1).max(300),
        reference: z.object({ quantity: finite, unit: z.string().max(80) }).nullable(),
        lines: z.array(line).max(200),
        total: quantity.nullable(),
        net: quantity.nullable(),
        page: z.number().int(),
      }),
    )
    .max(1000),
  anomalies: z.array(z.object({ page: z.number().int(), message: z.string().max(500) })).max(1000),
});

const planSchema = z.object({
  week: z.number().int().min(1).max(53).nullable(),
  groups: z
    .array(
      z.object({
        codes: z.array(z.string().regex(/^[A-Z]{2}\d{2}$/)).min(1).max(20),
        team: z.string().regex(/^[A-H]$/).nullable(),
        barquettes: finite.nullable(),
        block: z.enum(["plats", "petits_dejeuners"]),
        row: z.number().int(),
      }),
    )
    .max(200),
  volumes: z.array(z.object({ code: z.string().regex(/^[A-Z]{2}\d{2}$/), weekBarquettes: finite, firstDayBarquettes: finite, row: z.number().int() })).max(500),
  anomalies: z.array(z.string().max(500)).max(1000),
});

export const importPayloadSchema = z.object({
  tome: tomeSchema,
  plan: planSchema,
  tomeFileName: z.string().min(1).max(200),
  planFileName: z.string().min(1).max(200),
  planSheetName: z.string().min(1).max(50),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;
