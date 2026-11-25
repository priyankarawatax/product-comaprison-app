CREATE TABLE `wishlist_settings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `storeId` BIGINT NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false, `generalSettings` JSON NOT NULL,
  `buttonSettings` JSON NOT NULL, `pageSettings` JSON NOT NULL, `textSettings` JSON NOT NULL,
  `setupGuideDismissed` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `wishlist_settings_storeId_key`(`storeId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `wishlist_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `storeId` BIGINT NOT NULL,
  `shopifyCustomerId` VARCHAR(64) NOT NULL, `shopifyProductId` VARCHAR(64) NOT NULL,
  `shopifyVariantId` VARCHAR(64) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `wishlist_items_storeId_shopifyCustomerId_shopifyProductId_key`(`storeId`, `shopifyCustomerId`, `shopifyProductId`),
  INDEX `wishlist_items_storeId_shopifyCustomerId_createdAt_idx`(`storeId`, `shopifyCustomerId`, `createdAt`),
  INDEX `wishlist_items_storeId_shopifyProductId_idx`(`storeId`, `shopifyProductId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `wishlist_settings` ADD CONSTRAINT `wishlist_settings_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
