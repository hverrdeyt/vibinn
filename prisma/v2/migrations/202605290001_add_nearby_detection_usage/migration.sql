ALTER TABLE "User"
ADD COLUMN "nearbyDetectionMonthKey" TEXT,
ADD COLUMN "nearbyDetectionCount" INTEGER NOT NULL DEFAULT 0;
