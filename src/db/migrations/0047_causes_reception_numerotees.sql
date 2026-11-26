-- Réception (décision du 26/11/2026) : les causes sont numérotées comme en Cuisine et en Stockage (« 1. », « 2. »…),
-- dans l'ordre où elles sont proposées à la saisie ; « Autres causes » reste à la fin, sans numéro.
-- Seules les causes actives propres à la Réception sont renommées (une cause partagée avec une autre zone garde son
-- nom) ; un numéro déjà présent est remplacé. Les pertes déjà enregistrées gardent leur cause.
UPDATE "causes" AS c
SET "name" = v.n || '. ' || regexp_replace(c."name", '^[0-9]+\.\s*', ''), "updated_at" = now()
FROM (
  SELECT c2."id", row_number() OVER (ORDER BY c2."display_order", c2."name") AS n
  FROM "causes" c2
  WHERE c2."status" = 'active'
    AND NOT c2."is_other"
    AND EXISTS (
      SELECT 1 FROM "cause_zones" cz JOIN "zones" z ON z."id" = cz."zone_id"
      WHERE cz."cause_id" = c2."id" AND z."code" = 'RECEPTION'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "cause_zones" cz JOIN "zones" z ON z."id" = cz."zone_id"
      WHERE cz."cause_id" = c2."id" AND z."code" <> 'RECEPTION'
    )
) AS v
WHERE c."id" = v."id";
