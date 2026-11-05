-- Preserve the public UUID-style keys while moving all Product Finder relations to BIGINT AUTO_INCREMENT IDs.
ALTER TABLE `product_finders`
  ADD COLUMN `new_id` BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN `storeName` VARCHAR(191) NULL;

ALTER TABLE `product_finder_rule_sets`
  ADD COLUMN `new_id` BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN `key` VARCHAR(64) NULL,
  ADD COLUMN `new_finderId` BIGINT NULL,
  ADD COLUMN `vendor` VARCHAR(255) NULL,
  ADD COLUMN `productId` VARCHAR(100) NULL,
  ADD COLUMN `productTitle` VARCHAR(255) NULL;

ALTER TABLE `product_finder_questions`
  ADD COLUMN `new_id` BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN `key` VARCHAR(64) NULL,
  ADD COLUMN `new_finderId` BIGINT NULL,
  ADD COLUMN `new_ruleSetId` BIGINT NULL;

ALTER TABLE `product_finder_answers`
  ADD COLUMN `new_id` BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN `key` VARCHAR(64) NULL,
  ADD COLUMN `new_questionId` BIGINT NULL;

UPDATE `product_finders` f
INNER JOIN `stores` s ON s.`id` = f.`storeId`
SET f.`storeName` = s.`shop`;

UPDATE `product_finder_rule_sets` r
INNER JOIN `product_finders` f ON f.`id` = r.`finderId`
SET r.`key` = r.`id`, r.`new_finderId` = f.`new_id`;

UPDATE `product_finder_questions` q
INNER JOIN `product_finders` f ON f.`id` = q.`finderId`
INNER JOIN `product_finder_rule_sets` r ON r.`id` = q.`ruleSetId`
SET q.`key` = q.`id`, q.`new_finderId` = f.`new_id`, q.`new_ruleSetId` = r.`new_id`;

UPDATE `product_finder_answers` a
INNER JOIN `product_finder_questions` q ON q.`id` = a.`questionId`
SET a.`key` = a.`id`, a.`new_questionId` = q.`new_id`;

SET @drop_fk_0 = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_finder_answers' AND CONSTRAINT_NAME = 'product_finder_answers_questionId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY'), 'ALTER TABLE `product_finder_answers` DROP FOREIGN KEY `product_finder_answers_questionId_fkey`', 'SELECT 1');
PREPARE drop_fk_stmt_0 FROM @drop_fk_0;
EXECUTE drop_fk_stmt_0;
DEALLOCATE PREPARE drop_fk_stmt_0;
SET @drop_fk_1 = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_finder_questions' AND CONSTRAINT_NAME = 'product_finder_questions_finderId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY'), 'ALTER TABLE `product_finder_questions` DROP FOREIGN KEY `product_finder_questions_finderId_fkey`', 'SELECT 1');
PREPARE drop_fk_stmt_1 FROM @drop_fk_1;
EXECUTE drop_fk_stmt_1;
DEALLOCATE PREPARE drop_fk_stmt_1;
SET @drop_fk_2 = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_finder_questions' AND CONSTRAINT_NAME = 'product_finder_questions_ruleSetId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY'), 'ALTER TABLE `product_finder_questions` DROP FOREIGN KEY `product_finder_questions_ruleSetId_fkey`', 'SELECT 1');
PREPARE drop_fk_stmt_2 FROM @drop_fk_2;
EXECUTE drop_fk_stmt_2;
DEALLOCATE PREPARE drop_fk_stmt_2;
SET @drop_fk_3 = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_finder_rule_sets' AND CONSTRAINT_NAME = 'product_finder_rule_sets_finderId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY'), 'ALTER TABLE `product_finder_rule_sets` DROP FOREIGN KEY `product_finder_rule_sets_finderId_fkey`', 'SELECT 1');
PREPARE drop_fk_stmt_3 FROM @drop_fk_3;
EXECUTE drop_fk_stmt_3;
DEALLOCATE PREPARE drop_fk_stmt_3;
SET @drop_fk_4 = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_finders' AND CONSTRAINT_NAME = 'product_finders_storeId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY'), 'ALTER TABLE `product_finders` DROP FOREIGN KEY `product_finders_storeId_fkey`', 'SELECT 1');
PREPARE drop_fk_stmt_4 FROM @drop_fk_4;
EXECUTE drop_fk_stmt_4;
DEALLOCATE PREPARE drop_fk_stmt_4;

ALTER TABLE `product_finder_answers`
  DROP INDEX `product_finder_answers_questionId_position_idx`,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`new_id`),
  DROP COLUMN `id`,
  DROP COLUMN `questionId`;

ALTER TABLE `product_finder_answers`
  CHANGE COLUMN `new_id` `id` BIGINT NOT NULL AUTO_INCREMENT,
  CHANGE COLUMN `new_questionId` `questionId` BIGINT NOT NULL,
  MODIFY `key` VARCHAR(64) NOT NULL,
  ADD UNIQUE INDEX `product_finder_answers_key_key` (`key`),
  ADD INDEX `product_finder_answers_questionId_position_idx` (`questionId`, `position`);

ALTER TABLE `product_finder_questions`
  DROP INDEX `product_finder_questions_finderId_position_idx`,
  DROP INDEX `product_finder_questions_ruleSetId_position_idx`,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`new_id`),
  DROP COLUMN `id`,
  DROP COLUMN `finderId`,
  DROP COLUMN `ruleSetId`;

ALTER TABLE `product_finder_questions`
  CHANGE COLUMN `new_id` `id` BIGINT NOT NULL AUTO_INCREMENT,
  CHANGE COLUMN `new_finderId` `finderId` BIGINT NOT NULL,
  CHANGE COLUMN `new_ruleSetId` `ruleSetId` BIGINT NOT NULL,
  MODIFY `key` VARCHAR(64) NOT NULL,
  ADD UNIQUE INDEX `product_finder_questions_key_key` (`key`),
  ADD INDEX `product_finder_questions_finderId_position_idx` (`finderId`, `position`),
  ADD INDEX `product_finder_questions_ruleSetId_position_idx` (`ruleSetId`, `position`);

ALTER TABLE `product_finder_rule_sets`
  DROP INDEX `product_finder_rule_sets_finderId_position_idx`,
  DROP INDEX `product_finder_rule_sets_finderId_collectionId_key`,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`new_id`),
  DROP COLUMN `id`,
  DROP COLUMN `finderId`;

ALTER TABLE `product_finder_rule_sets`
  CHANGE COLUMN `new_id` `id` BIGINT NOT NULL AUTO_INCREMENT,
  CHANGE COLUMN `new_finderId` `finderId` BIGINT NOT NULL,
  MODIFY `key` VARCHAR(64) NOT NULL,
  ADD UNIQUE INDEX `product_finder_rule_sets_key_key` (`key`),
  ADD INDEX `product_finder_rule_sets_finderId_position_idx` (`finderId`, `position`),
  ADD UNIQUE INDEX `product_finder_rule_sets_finderId_collectionId_key` (`finderId`, `collectionId`),
  ADD UNIQUE INDEX `product_finder_rule_sets_finderId_productId_key` (`finderId`, `productId`);

ALTER TABLE `product_finders`
  DROP INDEX `product_finders_storeId_key`,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`new_id`),
  DROP COLUMN `id`,
  DROP COLUMN `storeId`;

ALTER TABLE `product_finders`
  CHANGE COLUMN `new_id` `id` BIGINT NOT NULL AUTO_INCREMENT,
  MODIFY `storeName` VARCHAR(191) NOT NULL,
  ADD UNIQUE INDEX `product_finders_storeName_key` (`storeName`);

ALTER TABLE `product_finder_answers` DROP INDEX `new_id`;
ALTER TABLE `product_finder_questions` DROP INDEX `new_id`;
ALTER TABLE `product_finder_rule_sets` DROP INDEX `new_id`;
ALTER TABLE `product_finders` DROP INDEX `new_id`;

ALTER TABLE `product_finders`
  ADD CONSTRAINT `product_finders_storeName_fkey` FOREIGN KEY (`storeName`) REFERENCES `stores`(`shop`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_finder_rule_sets`
  ADD CONSTRAINT `product_finder_rule_sets_finderId_fkey` FOREIGN KEY (`finderId`) REFERENCES `product_finders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_finder_questions`
  ADD CONSTRAINT `product_finder_questions_finderId_fkey` FOREIGN KEY (`finderId`) REFERENCES `product_finders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `product_finder_questions_ruleSetId_fkey` FOREIGN KEY (`ruleSetId`) REFERENCES `product_finder_rule_sets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_finder_answers`
  ADD CONSTRAINT `product_finder_answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `product_finder_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
