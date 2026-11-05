CREATE TABLE `analytics_events` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(36) NOT NULL,
  `shop` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(40) NOT NULL,
  `productId` VARCHAR(32) NULL,
  `variantId` VARCHAR(32) NULL,
  `sessionId` VARCHAR(36) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `analytics_events_shop_eventId_key` (`shop`, `eventId`),
  INDEX `analytics_events_shop_createdAt_idx` (`shop`, `createdAt`),
  INDEX `analytics_events_shop_eventType_createdAt_idx` (`shop`, `eventType`, `createdAt`),
  INDEX `analytics_events_shop_productId_createdAt_idx` (`shop`, `productId`, `createdAt`),
  INDEX `analytics_events_shop_sessionId_createdAt_idx` (`shop`, `sessionId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `analytics_comparison_products` (
  `eventId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(32) NOT NULL,
  `shop` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`eventId`, `productId`),
  INDEX `analytics_comparison_products_shop_createdAt_productId_idx` (`shop`, `createdAt`, `productId`),
  CONSTRAINT `analytics_comparison_products_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `analytics_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
