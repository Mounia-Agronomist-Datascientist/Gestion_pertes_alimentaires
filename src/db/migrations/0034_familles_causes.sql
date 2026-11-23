CREATE TYPE "public"."cause_avoidability" AS ENUM('evitable', 'inevitable', 'a_evaluer');--> statement-breakpoint
CREATE TYPE "public"."cause_family" AS ENUM('organisation', 'equipement_process', 'fournisseur_matiere', 'conservation', 'hygiene', 'surproduction', 'inherente', 'autre');--> statement-breakpoint
ALTER TABLE "causes" ADD COLUMN "family" "cause_family";--> statement-breakpoint
ALTER TABLE "causes" ADD COLUMN "avoidability" "cause_avoidability";--> statement-breakpoint
ALTER TABLE "causes" ADD COLUMN "classification_validated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Classement proposé (23/11/2026), à confirmer par l'administration (Administration → Causes) : famille de cause
-- racine et caractère évitable. Les causes sans code sont retrouvées par leur nom.
UPDATE "causes" c SET "family" = v.family::"cause_family", "avoidability" = v.avoid::"cause_avoidability"
FROM (VALUES
  ('CUI_CHUTE_GASTRO', NULL, 'organisation', 'evitable'),
  ('REC_CASSE_MANIP', NULL, 'organisation', 'evitable'),
  ('CON_CHUTE', NULL, 'organisation', 'evitable'),
  ('CON_BARQUETTE_ABIMEE', NULL, 'organisation', 'evitable'),
  ('CON_ERREUR_PRODUCTION', NULL, 'organisation', 'evitable'),
  ('CON_ETIQUETAGE', NULL, 'organisation', 'evitable'),
  ('ERREUR_PREPARATION', NULL, 'organisation', 'evitable'),
  ('STO_MAL_RETOURNE', NULL, 'organisation', 'evitable'),
  ('CUI_FOUR_SALE', NULL, 'organisation', 'evitable'),
  (NULL, 'bac oublie en chambre froide', 'organisation', 'evitable'),
  ('CON_DOSEUSE', NULL, 'equipement_process', 'evitable'),
  ('CON_SCELLAGE', NULL, 'equipement_process', 'evitable'),
  ('CON_POIDS', NULL, 'equipement_process', 'evitable'),
  ('CON_ASPECT', NULL, 'equipement_process', 'evitable'),
  ('NON_CONFORMITE_QUALITE', NULL, 'equipement_process', 'evitable'),
  ('REC_ARRIVE_CASSE', NULL, 'fournisseur_matiere', 'evitable'),
  ('REC_DESSOUVIDE', NULL, 'fournisseur_matiere', 'evitable'),
  (NULL, 'probleme de qualite abime pourri etc', 'fournisseur_matiere', 'evitable'),
  (NULL, 'probleme de temperature', 'fournisseur_matiere', 'evitable'),
  ('STO_DLC_COURTE', NULL, 'conservation', 'evitable'),
  ('STO_ABIME', NULL, 'conservation', 'evitable'),
  ('STO_CHAINE_FROID', NULL, 'conservation', 'evitable'),
  ('STO_EXCEDENT', NULL, 'conservation', 'evitable'),
  ('STO_MAUVAIS_STOCKAGE', NULL, 'conservation', 'evitable'),
  ('STO_OUVERT', NULL, 'conservation', 'evitable'),
  ('STO_PEREMPTION', NULL, 'conservation', 'evitable'),
  ('STO_ROTATION', NULL, 'conservation', 'evitable'),
  ('CUI_SURPLUS_NON_REUTILISABLE', NULL, 'surproduction', 'evitable'),
  ('CON_SURPRODUCTION', NULL, 'surproduction', 'evitable'),
  ('CON_PERSONNEL_NON_CONSOMME', NULL, 'surproduction', 'evitable'),
  ('STO_FIN_PROD', NULL, 'surproduction', 'evitable'),
  ('CUI_CHUTES_DECOUPE', NULL, 'inherente', 'inevitable'),
  ('CON_TEST_OXYGENE', NULL, 'inherente', 'inevitable'),
  ('FOND_GASTRO', NULL, 'inherente', 'inevitable'),
  ('AUTRES', NULL, 'autre', 'a_evaluer')
) AS v(code, name_key, family, avoid)
WHERE (v.code IS NOT NULL AND c."code" = v.code)
   OR (v.code IS NULL AND c."code" IS NULL AND trim(regexp_replace(lower(translate(c."name",
        'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc')), '[^a-z0-9]+', ' ', 'g')) = v.name_key);
