CREATE TABLE `product_finder_rule_sets` (
  `id` VARCHAR(191) NOT NULL, `finderId` VARCHAR(191) NOT NULL, `name` VARCHAR(100) NOT NULL,
  `sourceType` VARCHAR(20) NOT NULL DEFAULT 'all_products', `collectionId` VARCHAR(100) NULL,
  `collectionTitle` VARCHAR(255) NULL, `position` INTEGER NOT NULL, PRIMARY KEY (`id`),
  INDEX `product_finder_rule_sets_finderId_position_idx` (`finderId`, `position`),
  UNIQUE INDEX `product_finder_rule_sets_finderId_collectionId_key` (`finderId`, `collectionId`),
  CONSTRAINT `product_finder_rule_sets_finderId_fkey` FOREIGN KEY (`finderId`) REFERENCES `product_finders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `product_finder_questions` ADD COLUMN `ruleSetId` VARCHAR(191) NULL;
INSERT INTO `product_finder_rule_sets` (`id`, `finderId`, `name`, `sourceType`, `collectionId`, `collectionTitle`, `position`)
SELECT CONCAT('legacy-', `id`), `id`, 'Default rule', `sourceType`, `collectionId`, `collectionTitle`, 0 FROM `product_finders`;
UPDATE `product_finder_questions` q INNER JOIN `product_finder_rule_sets` r ON r.`finderId` = q.`finderId` AND r.`position` = 0 SET q.`ruleSetId` = r.`id`;
ALTER TABLE `product_finder_questions` MODIFY `ruleSetId` VARCHAR(191) NOT NULL;
CREATE INDEX `product_finder_questions_ruleSetId_position_idx` ON `product_finder_questions`(`ruleSetId`, `position`);
ALTER TABLE `product_finder_questions` ADD CONSTRAINT `product_finder_questions_ruleSetId_fkey` FOREIGN KEY (`ruleSetId`) REFERENCES `product_finder_rule_sets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
