ALTER TABLE `product_finders`
  ADD COLUMN `modalPadding` INTEGER NOT NULL DEFAULT 34,
  ADD COLUMN `answerPadding` INTEGER NOT NULL DEFAULT 16,
  ADD COLUMN `noMatchHeading` VARCHAR(160) NOT NULL DEFAULT 'No matching products found',
  ADD COLUMN `noMatchDescription` VARCHAR(500) NOT NULL DEFAULT 'We couldn''t find an exact match based on your selections. But you might like these popular picks instead.';
