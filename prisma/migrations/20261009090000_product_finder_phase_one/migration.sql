CREATE TABLE `product_finders` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `title` VARCHAR(160) NOT NULL DEFAULT 'Find the right product',
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  `buttonText` VARCHAR(80) NOT NULL DEFAULT 'Find the right product',
  `buttonPosition` VARCHAR(20) NOT NULL DEFAULT 'bottom_right',
  `showDesktop` BOOLEAN NOT NULL DEFAULT true,
  `showMobile` BOOLEAN NOT NULL DEFAULT true,
  `resultHeading` VARCHAR(160) NOT NULL DEFAULT 'Recommended for you',
  `recommendationLimit` INTEGER NOT NULL DEFAULT 3,
  `sourceType` VARCHAR(20) NOT NULL DEFAULT 'all_products',
  `collectionId` VARCHAR(100) NULL,
  `collectionTitle` VARCHAR(255) NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `product_finders_storeId_key` (`storeId`),
  CONSTRAINT `product_finders_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `product_finder_questions` (
  `id` VARCHAR(191) NOT NULL,
  `finderId` VARCHAR(191) NOT NULL,
  `question` VARCHAR(250) NOT NULL,
  `position` INTEGER NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`id`),
  INDEX `product_finder_questions_finderId_position_idx` (`finderId`, `position`),
  CONSTRAINT `product_finder_questions_finderId_fkey` FOREIGN KEY (`finderId`) REFERENCES `product_finders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `product_finder_answers` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(160) NOT NULL,
  `field` VARCHAR(350) NOT NULL,
  `operator` VARCHAR(30) NOT NULL,
  `value` VARCHAR(500) NOT NULL,
  `weight` INTEGER NOT NULL DEFAULT 1,
  `position` INTEGER NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `product_finder_answers_questionId_position_idx` (`questionId`, `position`),
  CONSTRAINT `product_finder_answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `product_finder_questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
