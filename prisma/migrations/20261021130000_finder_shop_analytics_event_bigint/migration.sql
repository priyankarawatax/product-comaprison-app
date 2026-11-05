-- Rename the Product Finder store key without changing its data.
ALTER TABLE `product_finders` DROP FOREIGN KEY `product_finders_storeName_fkey`;
ALTER TABLE `product_finders`
  DROP INDEX `product_finders_storeName_key`,
  CHANGE COLUMN `storeName` `shop` VARCHAR(191) NOT NULL AFTER `id`,
  ADD UNIQUE INDEX `product_finders_shop_key` (`shop`),
  ADD CONSTRAINT `product_finders_shop_fkey`
    FOREIGN KEY (`shop`) REFERENCES `stores` (`shop`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Assign numeric event IDs before changing the child foreign key,
-- so every compared-product row remains attached to its original event.
ALTER TABLE `analytics_events`
  ADD COLUMN `newId` BIGINT NOT NULL AUTO_INCREMENT UNIQUE FIRST;
ALTER TABLE `analytics_comparison_products`
  ADD COLUMN `newEventId` BIGINT NULL AFTER `eventId`;
UPDATE `analytics_comparison_products` AS child
INNER JOIN `analytics_events` AS parent ON parent.`id` = child.`eventId`
SET child.`newEventId` = parent.`newId`;

ALTER TABLE `analytics_comparison_products`
  DROP FOREIGN KEY `analytics_comparison_products_eventId_fkey`,
  DROP PRIMARY KEY,
  DROP COLUMN `eventId`,
  CHANGE COLUMN `newEventId` `eventId` BIGINT NOT NULL FIRST,
  ADD PRIMARY KEY (`eventId`, `productId`);

ALTER TABLE `analytics_events`
  DROP PRIMARY KEY,
  DROP COLUMN `id`,
  CHANGE COLUMN `newId` `id` BIGINT NOT NULL AUTO_INCREMENT FIRST,
  ADD PRIMARY KEY (`id`);
ALTER TABLE `analytics_events` DROP INDEX `newId`;

ALTER TABLE `analytics_comparison_products`
  ADD CONSTRAINT `analytics_comparison_products_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `analytics_events` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
