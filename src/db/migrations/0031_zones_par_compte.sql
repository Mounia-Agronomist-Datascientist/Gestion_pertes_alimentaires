-- Zones cochées pour chaque compte (décision du 19/11/2026) : saisie et résultats limités à ces zones.
-- Comptes existants : une équipe en Cuisine/production ; production, administration et direction dans toutes les
-- zones actives ; un responsable de zone garde les siennes.
INSERT INTO "user_zones" ("user_id", "zone_id")
SELECT u."id", z."id" FROM "users" u JOIN "zones" z ON z."code" = 'CUISINE'
WHERE u."role_code" = 'equipe'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_zones" ("user_id", "zone_id")
SELECT u."id", z."id" FROM "users" u CROSS JOIN "zones" z
WHERE u."role_code" IN ('resp_production', 'admin', 'direction') AND z."active" = true
ON CONFLICT DO NOTHING;
