-- AlterTable
ALTER TABLE "FeedPost"
ADD COLUMN "ratingLabel" "MomentRatingLabel",
ADD COLUMN "threeWordReview" TEXT;

-- Backfill from source moments
UPDATE "FeedPost" fp
SET
  "ratingLabel" = m."ratingLabel",
  "threeWordReview" = m."caption"
FROM "Moment" m
WHERE fp."sourceMomentId" = m."id";
