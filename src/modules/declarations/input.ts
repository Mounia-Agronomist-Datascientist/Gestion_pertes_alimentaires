/**
 * Format des données envoyées par le formulaire de déclaration.
 * Partagé entre le navigateur (aide à la saisie) et le serveur (contrôle définitif).
 */
import { z } from "zod";

export const PRODUCT_CATEGORIES = [
  "matiere_premiere",
  "sous_recette",
  "recette",
  "produit_fini",
  "produit_externe",
  "consommable",
  "moule_plat_gratin",
] as const;

export const PRODUCT_CATEGORY_LABELS: Record<(typeof PRODUCT_CATEGORIES)[number], string> = {
  matiere_premiere: "Matière première",
  sous_recette: "Sous-recette",
  recette: "Recette",
  produit_fini: "Produit fini",
  produit_externe: "Produit externe",
  consommable: "Consommable / emballage",
  moule_plat_gratin: "Moules et plats à gratin",
};

/** Types de produit qui ne sont pas des denrées : jamais convertis en kg alimentaires, pas de pesée en gastros. */
export const NON_FOOD_CATEGORIES: readonly string[] = ["consommable", "moule_plat_gratin"];
export const isNonFoodCategory = (category: string) => NON_FOOD_CATEGORIES.includes(category);

/** Méthodes proposées à l'utilisateur ; « conversion_reference » est déduite automatiquement. */
export const INPUT_METHODS = ["pesee", "comptage", "estimation_contenant", "estimation_manuelle"] as const;
export type InputMethod = (typeof INPUT_METHODS)[number];

export const METHOD_LABELS: Record<InputMethod, string> = {
  pesee: "Pesée",
  comptage: "Comptage",
  estimation_contenant: "Estimation par contenant",
  estimation_manuelle: "Estimation manuelle",
};

/** Unités proposées pour chaque méthode. */
export const METHOD_UNITS: Record<InputMethod, readonly string[]> = {
  pesee: ["kg", "g"],
  comptage: ["piece", "barquette", "contenant"],
  estimation_contenant: ["gastro", "contenant"],
  estimation_manuelle: ["kg", "g", "l", "ml", "piece", "barquette", "contenant", "gastro"],
};

const uuid = z.uuid({ message: "Identifiant invalide" });
const positive = z.number({ message: "Nombre attendu" }).positive("La quantité doit être supérieure à 0");

const tareInput = z.object({
  grossKg: positive,
  gastros: z.array(z.object({ containerTypeId: uuid, count: z.number().int().min(1) })),
  supportTypeId: uuid.nullable().optional(),
});

export const declarationInputSchema = z
  .object({
    occurredOn: z.iso.date({ message: "Date invalide" }),
    occurredTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Heure invalide")
      .nullable()
      .optional(),
    subzoneId: uuid,
    teamId: uuid.nullable().optional(),
    product: z.union([
      z.object({ productId: uuid }),
      z.object({ weekItem: z.object({ kind: z.enum(["plat", "sous_recette", "ingredient"]), id: uuid }) }),
      z.object({
        freeLabel: z.string().trim().min(2, "Indiquez le nom du produit").max(200),
        category: z.enum(PRODUCT_CATEGORIES),
      }),
    ]),
    method: z.enum(INPUT_METHODS),
    quantity: positive.nullable().optional(),
    unitCode: z.string().nullable().optional(),
    tare: tareInput.nullable().optional(),
    causeId: uuid,
    destinations: z
      .array(z.object({ destinationId: uuid, quantity: positive }))
      .min(1, "Choisissez au moins une destination"),
    destinationGapJustification: z.string().trim().max(500).nullable().optional(),
    comment: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tare) {
      if (v.method !== "pesee") {
        ctx.addIssue({ code: "custom", message: "La pesée en gastros n'est possible qu'avec la méthode « Pesée »" });
      }
    } else {
      if (v.quantity == null) ctx.addIssue({ code: "custom", message: "Indiquez la quantité", path: ["quantity"] });
      if (!v.unitCode || !METHOD_UNITS[v.method].includes(v.unitCode)) {
        ctx.addIssue({ code: "custom", message: "Unité non proposée pour cette méthode", path: ["unitCode"] });
      }
    }
  });

export type DeclarationInput = z.infer<typeof declarationInputSchema>;
