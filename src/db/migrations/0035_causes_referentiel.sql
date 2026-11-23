-- Référentiel des pertes, étape 2 (décision du 23/11/2026) : causes ajoutées zone par zone, chacune rangée dans sa
-- famille de cause racine (classement proposé, à valider dans Administration → Causes). Base neuve : rien à faire,
-- le remplissage initial crée ces causes.
UPDATE "causes" SET "name" = '4. Rupture du froid (panne de chambre)', "status" = 'active', "family" = 'equipement_process',
  "avoidability" = 'evitable', "classification_validated" = false, "display_order" = 601, "updated_at" = now()
WHERE "code" = 'STO_CHAINE_FROID';--> statement-breakpoint
UPDATE "causes" SET "name" = '7. Lot oublié / surstock', "status" = 'active', "family" = 'conservation',
  "avoidability" = 'evitable', "classification_validated" = false, "display_order" = 604, "updated_at" = now()
WHERE "code" = 'STO_EXCEDENT';--> statement-breakpoint
INSERT INTO "causes" ("code", "name", "description", "status", "display_order", "family", "avoidability")
SELECT v.code, v.name, v.description, 'active', v.ord, v.family::"cause_family", v.avoid::"cause_avoidability"
FROM (VALUES
  ('STO_NUISIBLES', '5. Nuisibles', 'Insectes, rongeurs', 602, 'hygiene', 'evitable'),
  ('STO_MANUTENTION', '6. Chute / écrasement en manutention', NULL, 603, 'organisation', 'evitable'),
  ('CUI_SURCUISSON', 'Surcuisson / brûlé', NULL, 610, 'equipement_process', 'evitable'),
  ('CUI_ERREUR_RECETTE', 'Erreur de recette ou de dosage', 'Mauvais ingrédient, mauvaise quantité', 611, 'organisation', 'evitable'),
  ('CUI_RESIDU_MARMITE', 'Résidu au fond de la marmite', 'Produit attaché aux parois ou au fond', 612, 'inherente', 'inevitable'),
  ('PANNE_EQUIPEMENT', 'Panne d''équipement', NULL, 613, 'equipement_process', 'evitable'),
  ('REC_CORPS_ETRANGER', 'Corps étranger / contamination', NULL, 620, 'hygiene', 'evitable'),
  ('CON_REGLAGE_LIGNE', 'Réglage / démarrage de la ligne', 'Barquettes perdues au réglage ou au démarrage', 630, 'equipement_process', 'a_evaluer')
) AS v(code, name, description, ord, family, avoid)
WHERE EXISTS (SELECT 1 FROM "causes" WHERE "code" = 'AUTRES')
ON CONFLICT ("code") WHERE "code" IS NOT NULL DO NOTHING;--> statement-breakpoint
INSERT INTO "cause_zones" ("cause_id", "zone_id")
SELECT c."id", z."id"
FROM (VALUES
  ('STO_CHAINE_FROID', 'STOCKAGE'), ('STO_EXCEDENT', 'STOCKAGE'), ('STO_NUISIBLES', 'STOCKAGE'),
  ('STO_MANUTENTION', 'STOCKAGE'), ('CUI_SURCUISSON', 'CUISINE'), ('CUI_ERREUR_RECETTE', 'CUISINE'),
  ('CUI_RESIDU_MARMITE', 'CUISINE'), ('PANNE_EQUIPEMENT', 'CUISINE'), ('PANNE_EQUIPEMENT', 'CONDITIONNEMENT'),
  ('REC_CORPS_ETRANGER', 'RECEPTION'), ('CON_REGLAGE_LIGNE', 'CONDITIONNEMENT')
) AS v(code, zone)
JOIN "causes" c ON c."code" = v.code
JOIN "zones" z ON z."code" = v.zone
ON CONFLICT DO NOTHING;
