-- Des moules à manger (« moules décoquillées cuites ») avaient été rangées comme moule ou plat à gratin
-- (emballage) : elles redeviennent des matières premières. Les pertes déjà enregistrées gardent leur coût.
UPDATE "products"
SET "category" = 'matiere_premiere', "updated_at" = now()
WHERE "category" = 'moule_plat_gratin'
  AND "name" !~* '^\s*moules?\s+(rond|rectangulaire|carr[ée]|ovale|individuel|silicone|biod[ée]g|cake|tarte|muffin|cannel|savarin|kouglof|papier|alu|à\s|a\s)'
  AND "name" !~* 'plats? à gratin';
