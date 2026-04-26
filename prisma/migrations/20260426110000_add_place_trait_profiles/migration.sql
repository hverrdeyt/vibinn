-- CreateTable
CREATE TABLE "PlaceTraitProfile" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "sourceVersion" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "quietScore" DOUBLE PRECISION NOT NULL,
    "socialScore" DOUBLE PRECISION NOT NULL,
    "soloScore" DOUBLE PRECISION NOT NULL,
    "cozyScore" DOUBLE PRECISION NOT NULL,
    "workScore" DOUBLE PRECISION NOT NULL,
    "dateScore" DOUBLE PRECISION NOT NULL,
    "utilitarianScore" DOUBLE PRECISION NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "quickReadyScore" DOUBLE PRECISION NOT NULL,
    "stayReadyScore" DOUBLE PRECISION NOT NULL,
    "budgetFriendlyScore" DOUBLE PRECISION NOT NULL,
    "archetype" TEXT,
    "evidenceJson" JSONB,
    "rawResponseJson" JSONB,
    "inputSnapshotJson" JSONB,
    "enrichedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceTraitProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaceTraitProfile_placeId_key" ON "PlaceTraitProfile"("placeId");

-- AddForeignKey
ALTER TABLE "PlaceTraitProfile" ADD CONSTRAINT "PlaceTraitProfile_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
