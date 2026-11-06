ALTER TABLE `stores`
  ADD COLUMN `billingSelectionRequired` BOOLEAN NOT NULL DEFAULT false;

UPDATE `stores` AS store_row
LEFT JOIN `subscription` AS subscription_row
  ON subscription_row.`shop` = store_row.`shop`
SET store_row.`billingSelectionRequired` = true
WHERE store_row.`uninstalledAt` IS NOT NULL
   OR subscription_row.`status` = 'UNINSTALLED';
