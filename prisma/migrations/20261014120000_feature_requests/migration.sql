CREATE TABLE `feature_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `shop` VARCHAR(255) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `description` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `feature_requests_shop_createdAt_idx`(`shop`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `feature_requests_shop_fkey`
    FOREIGN KEY (`shop`) REFERENCES `stores`(`shop`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
