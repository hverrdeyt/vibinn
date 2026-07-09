CREATE TABLE "TopPlaceTieBreakPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lowerPlaceId" TEXT NOT NULL,
    "higherPlaceId" TEXT NOT NULL,
    "preferredPlaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopPlaceTieBreakPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TopPlaceTieBreakPreference_userId_lowerPlaceId_higherPlaceId_key"
ON "TopPlaceTieBreakPreference"("userId", "lowerPlaceId", "higherPlaceId");

CREATE INDEX "TopPlaceTieBreakPreference_userId_preferredPlaceId_idx"
ON "TopPlaceTieBreakPreference"("userId", "preferredPlaceId");

ALTER TABLE "TopPlaceTieBreakPreference"
ADD CONSTRAINT "TopPlaceTieBreakPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
