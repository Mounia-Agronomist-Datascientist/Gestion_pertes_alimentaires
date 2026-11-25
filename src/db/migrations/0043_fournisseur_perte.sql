ALTER TABLE "loss_declarations" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Pertes déjà enregistrées en Réception et en Stockage (décision du 26/11/2026) : fournisseur du colis choisi (lu
-- dans « … — Fournisseur »), sinon dernier fournisseur livré avant la perte, sinon colis ou fournisseur saisis à la main.
UPDATE "loss_declarations" d
SET "supplier_id" = COALESCE(
  (SELECT f."id" FROM "suppliers" f
    WHERE d."packaging_label" LIKE '% — ' || f."name" || '%'
    ORDER BY length(f."name") DESC LIMIT 1),
  (SELECT sp."supplier_id" FROM "supplier_products" sp
    WHERE sp."product_id" = d."product_id"
    ORDER BY (sp."last_delivery_date" <= d."occurred_on") DESC, sp."last_delivery_date" DESC LIMIT 1),
  (SELECT mp."supplier_id" FROM "manual_packagings" mp WHERE mp."product_id" = d."product_id" LIMIT 1),
  (SELECT p."manual_supplier_id" FROM "products" p WHERE p."id" = d."product_id")
)
WHERE d."product_id" IS NOT NULL
  AND d."zone_id" IN (SELECT z."id" FROM "zones" z WHERE z."code" IN ('RECEPTION', 'STOCKAGE'));
