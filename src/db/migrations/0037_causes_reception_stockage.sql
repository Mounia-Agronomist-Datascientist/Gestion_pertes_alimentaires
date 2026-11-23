-- Retours du futur utilisateur (décision du 23/11/2026).
-- Réception : la marchandise n'est jamais acceptée en cas de problème de température, la cause est retirée (les pertes
-- déjà enregistrées la gardent) ; ajout de « Étiquetage ou emballage non conforme ».
-- Toutes zones : « Autres pertes » devient « Autres causes ».
-- Stockage : 1. DLC, 2. Qualité, 3. Retour non conforme, 4. Surstock, 5. Retour non utilisable (nouvelle),
-- 6. Rupture du froid, 7. Nuisibles, 8. Chute / écrasement.
-- Base neuve : rien à faire ici, le remplissage initial crée ces causes.
UPDATE "causes" SET "status" = 'inactive', "updated_at" = now()
WHERE "status" = 'active' AND NOT "is_other" AND "name" ILIKE '%température%'
  AND EXISTS (
    SELECT 1 FROM "cause_zones" cz JOIN "zones" z ON z."id" = cz."zone_id"
    WHERE cz."cause_id" = "causes"."id" AND z."code" = 'RECEPTION'
  );--> statement-breakpoint
UPDATE "causes" SET "name" = 'Autres causes', "updated_at" = now()
WHERE "is_other" AND "name" = 'Autres pertes';--> statement-breakpoint
UPDATE "causes" SET "name" = '4. Surstock', "display_order" = 598, "updated_at" = now()
WHERE "code" = 'STO_EXCEDENT';--> statement-breakpoint
UPDATE "causes" SET "name" = regexp_replace("name", '^[0-9]+\. ', '6. '), "updated_at" = now()
WHERE "code" = 'STO_CHAINE_FROID' AND "name" ~ '^[0-9]+\. ';--> statement-breakpoint
UPDATE "causes" SET "name" = regexp_replace("name", '^[0-9]+\. ', '7. '), "updated_at" = now()
WHERE "code" = 'STO_NUISIBLES' AND "name" ~ '^[0-9]+\. ';--> statement-breakpoint
UPDATE "causes" SET "name" = regexp_replace("name", '^[0-9]+\. ', '8. '), "updated_at" = now()
WHERE "code" = 'STO_MANUTENTION' AND "name" ~ '^[0-9]+\. ';--> statement-breakpoint
INSERT INTO "causes" ("code", "name", "description", "status", "display_order", "family", "avoidability")
SELECT v.code, v.name, v.description, 'active', v.ord, v.family::"cause_family", v.avoid::"cause_avoidability"
FROM (VALUES
  ('REC_ETIQUETAGE', 'Étiquetage ou emballage non conforme', 'Pas de n° de lot ou de DLC, etc.', 501, 'fournisseur_matiere', 'evitable'),
  ('STO_RETOUR_INUTILISABLE', '5. Retour non utilisable', 'Ex. seau de crème ouvert depuis plus de 48 h', 599, 'conservation', 'evitable')
) AS v(code, name, description, ord, family, avoid)
WHERE EXISTS (SELECT 1 FROM "causes" WHERE "code" = 'AUTRES')
ON CONFLICT ("code") WHERE "code" IS NOT NULL DO NOTHING;--> statement-breakpoint
INSERT INTO "cause_zones" ("cause_id", "zone_id")
SELECT c."id", z."id"
FROM (VALUES ('REC_ETIQUETAGE', 'RECEPTION'), ('STO_RETOUR_INUTILISABLE', 'STOCKAGE')) AS v(code, zone)
JOIN "causes" c ON c."code" = v.code
JOIN "zones" z ON z."code" = v.zone
ON CONFLICT DO NOTHING;
