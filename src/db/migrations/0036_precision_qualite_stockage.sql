-- « 2. Problème de qualité » (Stockage) : la rupture du froid a désormais sa propre cause, « 4. Rupture du froid
-- (panne de chambre) » (décision du 23/11/2026) ; elle est retirée de la précision pour éviter l'hésitation.
UPDATE "causes"
SET "description" = replace("description", ' ou rupture de la chaîne du froid', ''), "updated_at" = now()
WHERE "code" = 'STO_ABIME' AND "description" LIKE '% ou rupture de la chaîne du froid%';
