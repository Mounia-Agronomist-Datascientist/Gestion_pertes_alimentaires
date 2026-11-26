-- Fournisseurs en double (décision du 26/11/2026) : « Passion Froid » et « Passion Froid (BOF) », « Moulin de Sauret »
-- et « Moulin de sauret (Stock Sécu) », « Pro à Pro (Neg) », « Palais des Saveurs SIREN/SIRET : … »… sont regroupés
-- sous un seul fournisseur. Clé = nom sans ce qui est entre parenthèses ni le n° SIRET (comme src/domain/fournisseurs.ts) ;
-- nom affiché sans n° SIRET. Bons, colis, articles et pertes passent sur le fournisseur gardé.
DO $$
BEGIN
  CREATE TEMP TABLE f_clean ON COMMIT DROP AS
  SELECT f.id, f.name, f.created_at,
         btrim(regexp_replace(regexp_replace(f.name, '\s*[-–,]?\s*SIRE[NT](\s*/\s*SIRE[NT])?\s*:?\s*[0-9][0-9 ]*', ' ', 'gi'), '\s{2,}', ' ', 'g')) AS clean_name
  FROM suppliers f;

  ALTER TABLE f_clean ADD COLUMN ckey text;
  UPDATE f_clean SET ckey = btrim(regexp_replace(lower(translate(
      regexp_replace(clean_name, '\([^)]*\)', ' ', 'g'),
      'àâäáãåéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')), '[^a-z0-9]+', ' ', 'g'));

  -- Fournisseur gardé par clé : celui dont le nom n'a ni parenthèses ni SIRET, puis le plus de bons, puis le plus ancien.
  CREATE TEMP TABLE f_keep ON COMMIT DROP AS
  SELECT DISTINCT ON (c.ckey) c.ckey, c.id AS keep_id
  FROM f_clean c
  ORDER BY c.ckey,
           (c.clean_name !~ '\(' AND c.clean_name = c.name) DESC,
           (SELECT count(*) FROM purchase_orders po WHERE po.supplier_id = c.id) DESC,
           c.created_at;

  CREATE TEMP TABLE f_map ON COMMIT DROP AS
  SELECT c.id AS dup_id, k.keep_id FROM f_clean c JOIN f_keep k ON k.ckey = c.ckey WHERE c.id <> k.keep_id;

  UPDATE purchase_orders t SET supplier_id = m.keep_id FROM f_map m WHERE t.supplier_id = m.dup_id;
  UPDATE products t SET manual_supplier_id = m.keep_id FROM f_map m WHERE t.manual_supplier_id = m.dup_id;
  UPDATE loss_declarations t SET supplier_id = m.keep_id FROM f_map m WHERE t.supplier_id = m.dup_id;

  -- Colis par fournisseur : une ligne par produit ; la livraison la plus récente l'emporte.
  UPDATE supplier_products k
  SET supplier_code = d.supplier_code, packaging_label = d.packaging_label, content_quantity = d.content_quantity,
      content_unit = d.content_unit, last_order_id = d.last_order_id, last_delivery_date = d.last_delivery_date,
      updated_at = now()
  FROM supplier_products d JOIN f_map m ON m.dup_id = d.supplier_id
  WHERE k.supplier_id = m.keep_id AND k.product_id = d.product_id AND d.last_delivery_date > k.last_delivery_date;
  DELETE FROM supplier_products d USING f_map m
  WHERE d.supplier_id = m.dup_id
    AND EXISTS (SELECT 1 FROM supplier_products k WHERE k.supplier_id = m.keep_id AND k.product_id = d.product_id);
  UPDATE supplier_products t SET supplier_id = m.keep_id FROM f_map m WHERE t.supplier_id = m.dup_id;

  DELETE FROM manual_packagings d USING f_map m
  WHERE d.supplier_id = m.dup_id
    AND EXISTS (SELECT 1 FROM manual_packagings k WHERE k.supplier_id = m.keep_id AND k.product_id = d.product_id);
  UPDATE manual_packagings t SET supplier_id = m.keep_id FROM f_map m WHERE t.supplier_id = m.dup_id;

  -- Un fournisseur regroupé avec un fournisseur connu par les bons n'est plus « à valider ».
  UPDATE suppliers s SET to_validate = false
  FROM f_map m JOIN suppliers d ON d.id = m.dup_id
  WHERE s.id = m.keep_id AND NOT d.to_validate;

  DELETE FROM suppliers s USING f_map m WHERE s.id = m.dup_id;

  UPDATE suppliers s SET name = c.clean_name, key = c.ckey, updated_at = now()
  FROM f_clean c WHERE c.id = s.id AND (s.name <> c.clean_name OR s.key <> c.ckey);
END $$;
