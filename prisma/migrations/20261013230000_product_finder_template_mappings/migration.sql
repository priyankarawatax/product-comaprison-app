ALTER TABLE product_finder_questions
  ADD COLUMN templateQuestionId VARCHAR(64) NULL,
  ADD COLUMN mappingType VARCHAR(40) NULL,
  ADD COLUMN fieldKey VARCHAR(350) NULL,
  ADD COLUMN required BOOLEAN NOT NULL DEFAULT false;
