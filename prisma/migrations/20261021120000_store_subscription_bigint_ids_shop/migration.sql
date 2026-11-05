-- Preserve rows while replacing unused string surrogate IDs with BIGINT IDs.
-- Store relationships remain keyed by the stable shop domain.
ALTER TABLE `subscription` DROP FOREIGN KEY `subscription_storeName_fkey`;
ALTER TABLE `product_finders` DROP FOREIGN KEY `product_finders_storeName_fkey`;
ALTER TABLE `feature_requests` DROP FOREIGN KEY `feature_requests_shop_fkey`;
ALTER TABLE `product_finder_answers` DROP FOREIGN KEY `product_finder_answers_questionId_fkey`;
ALTER TABLE `product_finder_questions` DROP FOREIGN KEY `product_finder_questions_ruleSetId_fkey`;

ALTER TABLE `subscription`
  DROP INDEX `subscription_storeName_key`,
  CHANGE COLUMN `storeName` `shop` VARCHAR(191) NOT NULL AFTER `id`,
  ADD UNIQUE INDEX `subscription_shop_key` (`shop`);

ALTER TABLE `subscription`
  DROP PRIMARY KEY,
  DROP COLUMN `id`,
  ADD COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT FIRST,
  ADD PRIMARY KEY (`id`);

ALTER TABLE `stores`
  DROP PRIMARY KEY,
  DROP COLUMN `id`,
  ADD COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT FIRST,
  ADD PRIMARY KEY (`id`);

ALTER TABLE `stores`
  MODIFY COLUMN `shop` VARCHAR(191) NOT NULL AFTER `id`;

ALTER TABLE `product_finder_rule_sets`
  MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT FIRST;
ALTER TABLE `product_finder_questions`
  MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT FIRST;
ALTER TABLE `product_finder_answers`
  MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT FIRST;

ALTER TABLE `subscription`
  ADD CONSTRAINT `subscription_shop_fkey`
    FOREIGN KEY (`shop`) REFERENCES `stores` (`shop`)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_finders`
  ADD CONSTRAINT `product_finders_storeName_fkey`
    FOREIGN KEY (`storeName`) REFERENCES `stores` (`shop`)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `feature_requests`
  ADD CONSTRAINT `feature_requests_shop_fkey`
    FOREIGN KEY (`shop`) REFERENCES `stores` (`shop`)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_finder_questions`
  ADD CONSTRAINT `product_finder_questions_ruleSetId_fkey`
    FOREIGN KEY (`ruleSetId`) REFERENCES `product_finder_rule_sets` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_finder_answers`
  ADD CONSTRAINT `product_finder_answers_questionId_fkey`
    FOREIGN KEY (`questionId`) REFERENCES `product_finder_questions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
