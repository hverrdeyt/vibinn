-- CreateEnum
CREATE TYPE "GooglePlaceSnapshotSource" AS ENUM ('TEXT_SEARCH', 'PLACE_DETAILS');

-- CreateTable
CREATE TABLE "PlaceGoogleSnapshot" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "googlePlaceId" TEXT NOT NULL,
    "source" "GooglePlaceSnapshotSource" NOT NULL,
    "queryContext" TEXT,
    "payloadJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceGoogleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceGoogleSnapshot_placeId_fetchedAt_idx" ON "PlaceGoogleSnapshot"("placeId", "fetchedAt");

-- CreateIndex
CREATE INDEX "PlaceGoogleSnapshot_googlePlaceId_source_fetchedAt_idx" ON "PlaceGoogleSnapshot"("googlePlaceId", "source", "fetchedAt");

-- AddForeignKey
ALTER TABLE "PlaceGoogleSnapshot" ADD CONSTRAINT "PlaceGoogleSnapshot_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
