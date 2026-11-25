-- Le pot où la panna cotta est coulée (« Pot KRAFT 100ml ») compte comme un moule (décision du 26/11/2026).
UPDATE "products"
SET "category" = 'moule_plat_gratin', "updated_at" = now()
WHERE "category" = 'matiere_premiere' AND "name" ~* '^\s*pots?\s+(panna|kraft)';
