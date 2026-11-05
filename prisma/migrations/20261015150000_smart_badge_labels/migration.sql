ALTER TABLE `stores`
  ADD COLUMN `badgeLowestPriceLabel` VARCHAR(40) NOT NULL DEFAULT 'Lowest Price',
  ADD COLUMN `badgeBestRatedLabel` VARCHAR(40) NOT NULL DEFAULT 'Best Rated',
  ADD COLUMN `badgeMostPopularLabel` VARCHAR(40) NOT NULL DEFAULT 'Most Popular',
  ADD COLUMN `badgeBestValueLabel` VARCHAR(40) NOT NULL DEFAULT 'Best Value';
