CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "placeLocation" TEXT NOT NULL,
    "placeAddress" TEXT,
    "placeNeighborhood" TEXT,
    "placeCategory" TEXT,
    "placeGooglePlaceId" TEXT,
    "autocompleteSessionToken" TEXT,
    "placeLatitude" DOUBLE PRECISION,
    "placeLongitude" DOUBLE PRECISION,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "uploadedMedia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" INTEGER,
    "ratingLabel" TEXT,
    "wouldRevisit" TEXT,
    "vibeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Moment_userId_visitedAt_idx" ON "Moment"("userId", "visitedAt");
CREATE INDEX "Moment_placeGooglePlaceId_idx" ON "Moment"("placeGooglePlaceId");

ALTER TABLE "Moment" ADD CONSTRAINT "Moment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
