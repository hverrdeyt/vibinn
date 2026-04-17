CREATE TYPE "MomentRatingLabel" AS ENUM ('DISLIKED', 'NOT_BAD', 'LIKED', 'RECOMMENDED');

ALTER TABLE "Moment"
ADD COLUMN "ratingLabel" "MomentRatingLabel" NOT NULL DEFAULT 'LIKED';

UPDATE "Moment"
SET "ratingLabel" = 'LIKED';
