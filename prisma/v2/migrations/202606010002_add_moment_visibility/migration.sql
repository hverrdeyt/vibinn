CREATE TYPE "MomentVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

ALTER TABLE "Moment"
ADD COLUMN "visibility" "MomentVisibility" NOT NULL DEFAULT 'PUBLIC';
