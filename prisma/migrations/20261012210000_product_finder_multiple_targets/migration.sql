ALTER TABLE `product_finder_rule_sets`
  ADD COLUMN `collections` JSON NULL,
  ADD COLUMN `vendors` JSON NULL,
  ADD COLUMN `products` JSON NULL;

UPDATE `product_finder_rule_sets`
SET `collections` = JSON_ARRAY(JSON_OBJECT('id', `collectionId`, 'title', COALESCE(`collectionTitle`, ''), 'imageUrl', NULL, 'productCount', NULL))
WHERE `collectionId` IS NOT NULL;

UPDATE `product_finder_rule_sets`
SET `vendors` = JSON_ARRAY(`vendor`)
WHERE `vendor` IS NOT NULL AND TRIM(`vendor`) <> '';

UPDATE `product_finder_rule_sets`
SET `products` = JSON_ARRAY(JSON_OBJECT('id', `productId`, 'title', COALESCE(`productTitle`, ''), 'imageUrl', NULL))
WHERE `productId` IS NOT NULL;
