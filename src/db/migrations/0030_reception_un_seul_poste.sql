-- Réception : un seul poste, « Réception des marchandises » (décision du 19/11/2026). « Contrôle des marchandises »
-- est désactivé, pas supprimé : les pertes déjà rattachées le gardent.
UPDATE "subzones" SET "active" = false, "updated_at" = now() WHERE "code" = 'REC_CONTROLE';
