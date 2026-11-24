-- Cuisine / Production (décision du 24/11/2026) : « Salle blanche » devient « Cellule de refroidissement et Salle
-- blanche », et les 4 postes proposent la même liste de causes, dans cet ordre :
-- 1. Non-conformité POIDS, 2. Non-conformité CUISSON, 3. Non-conformité INGRÉDIENT, 4. Surplus non utilisable,
-- 5. Chute de gastro, 6. Oubli de gastro sur une échelle, 7. Non-protection des gastros, 8. Contamination / corps
-- étranger, 9. Panne / casse machine, 10. Erreur de déboîtage / préparation, 11. Erreur sur les chiffres
-- prévisionnels, puis « Autres causes ».
-- Les causes de même sens sont reprises (renommées) ; les autres quittent la Cuisine et, si elles n'ont plus de zone,
-- sont désactivées. Les pertes déjà enregistrées gardent leur cause.
-- Base neuve : rien à faire ici, le remplissage initial crée ces causes.
UPDATE "subzones"
SET "name" = CASE WHEN "name" ~ '^[0-9]+\. ' THEN '4. Cellule de refroidissement et Salle blanche'
                  ELSE 'Cellule de refroidissement et Salle blanche' END,
    "updated_at" = now()
WHERE "code" = 'CUI_SALLE_BLANCHE';--> statement-breakpoint
UPDATE "causes" AS c
SET "name" = v.name, "description" = v.description, "display_order" = v.ord, "status" = 'active', "updated_at" = now()
FROM (VALUES
  ('CUI_SURCUISSON', '2. Non-conformité CUISSON', 'Trop ou pas assez cuit', 621),
  ('CUI_SURPLUS_NON_REUTILISABLE', '4. Surplus non utilisable', 'Week-end ou fin de semaine de production', 623),
  ('CUI_CHUTE_GASTRO', '5. Chute de gastro', 'Gastro tombé', 624),
  ('ERREUR_PREPARATION', '10. Erreur de déboîtage / préparation', NULL, 629)
) AS v(code, name, description, ord)
WHERE c."code" = v.code;--> statement-breakpoint
INSERT INTO "causes" ("code", "name", "description", "status", "display_order", "family", "avoidability")
SELECT v.code, v.name, v.description, 'active', v.ord, v.family::"cause_family", v.avoid::"cause_avoidability"
FROM (VALUES
  ('CUI_NC_POIDS', '1. Non-conformité POIDS', 'Poids inférieur ou supérieur au poids théorique', 620, 'organisation', 'evitable'),
  ('CUI_NC_INGREDIENT', '3. Non-conformité INGRÉDIENT', 'Changement de référence, allergène, DLC, packaging, etc.', 622, 'fournisseur_matiere', 'evitable'),
  ('CUI_OUBLI_ECHELLE', '6. Oubli de gastro sur une échelle', NULL, 625, 'organisation', 'evitable'),
  ('CUI_PROTECTION_GASTRO', '7. Non-protection des gastros', 'En cellule', 626, 'hygiene', 'evitable'),
  ('CUI_CONTAMINATION', '8. Contamination / corps étranger', NULL, 627, 'hygiene', 'evitable'),
  ('CUI_PANNE_MACHINE', '9. Panne / casse machine', NULL, 628, 'equipement_process', 'evitable'),
  ('CUI_PREVISIONNEL', '11. Erreur sur les chiffres prévisionnels', NULL, 630, 'surproduction', 'evitable')
) AS v(code, name, description, ord, family, avoid)
WHERE EXISTS (SELECT 1 FROM "causes" WHERE "code" = 'AUTRES')
ON CONFLICT ("code") WHERE "code" IS NOT NULL DO NOTHING;--> statement-breakpoint
-- « Erreur de déboîtage / préparation » ne sert plus qu'en Cuisine.
DELETE FROM "cause_zones"
WHERE "cause_id" IN (SELECT "id" FROM "causes" WHERE "code" = 'ERREUR_PREPARATION')
  AND "zone_id" IN (SELECT "id" FROM "zones" WHERE "code" <> 'CUISINE');--> statement-breakpoint
-- Les causes hors de la liste quittent la Cuisine (les propositions des équipes en attente ne bougent pas).
DELETE FROM "cause_zones"
WHERE "zone_id" IN (SELECT "id" FROM "zones" WHERE "code" = 'CUISINE')
  AND "cause_id" IN (
    SELECT "id" FROM "causes"
    WHERE "status" = 'active' AND NOT "is_other"
      AND ("code" IS NULL OR "code" NOT IN (
        'CUI_NC_POIDS', 'CUI_SURCUISSON', 'CUI_NC_INGREDIENT', 'CUI_SURPLUS_NON_REUTILISABLE', 'CUI_CHUTE_GASTRO',
        'CUI_OUBLI_ECHELLE', 'CUI_PROTECTION_GASTRO', 'CUI_CONTAMINATION', 'CUI_PANNE_MACHINE', 'ERREUR_PREPARATION',
        'CUI_PREVISIONNEL'))
  );--> statement-breakpoint
INSERT INTO "cause_zones" ("cause_id", "zone_id")
SELECT c."id", z."id"
FROM "causes" c, "zones" z
WHERE z."code" = 'CUISINE' AND c."code" IN (
  'CUI_NC_POIDS', 'CUI_SURCUISSON', 'CUI_NC_INGREDIENT', 'CUI_SURPLUS_NON_REUTILISABLE', 'CUI_CHUTE_GASTRO',
  'CUI_OUBLI_ECHELLE', 'CUI_PROTECTION_GASTRO', 'CUI_CONTAMINATION', 'CUI_PANNE_MACHINE', 'ERREUR_PREPARATION',
  'CUI_PREVISIONNEL')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Même liste aux 4 postes : plus de restriction à un poste en Cuisine.
DELETE FROM "cause_subzones"
WHERE "subzone_id" IN (
  SELECT s."id" FROM "subzones" s JOIN "zones" z ON z."id" = s."zone_id" WHERE z."code" = 'CUISINE'
);--> statement-breakpoint
-- Une cause de Cuisine qui n'a plus aucune zone n'est plus proposée nulle part : elle est désactivée.
UPDATE "causes" SET "status" = 'inactive', "updated_at" = now()
WHERE "status" = 'active' AND NOT "is_other" AND ("code" IS NULL OR "code" LIKE 'CUI\_%')
  AND NOT EXISTS (SELECT 1 FROM "cause_zones" cz WHERE cz."cause_id" = "causes"."id");
