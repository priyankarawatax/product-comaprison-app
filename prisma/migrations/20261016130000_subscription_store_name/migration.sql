ALTER TABLE `subscription`
  ADD COLUMN `storeName` VARCHAR(191) NULL;

UPDATE `subscription` AS subscription_row
INNER JOIN `stores` AS store_row ON store_row.`id` = subscription_row.`storeId`
SET subscription_row.`storeName` = store_row.`shop`;

ALTER TABLE `subscription`
  DROP FOREIGN KEY `subscription_storeId_fkey`,
  DROP INDEX `subscription_storeId_key`,
  MODIFY `storeName` VARCHAR(191) NOT NULL,
  ADD UNIQUE INDEX `subscription_storeName_key` (`storeName`),
  ADD CONSTRAINT `subscription_storeName_fkey`
    FOREIGN KEY (`storeName`) REFERENCES `stores` (`shop`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  DROP COLUMN `storeId`;
