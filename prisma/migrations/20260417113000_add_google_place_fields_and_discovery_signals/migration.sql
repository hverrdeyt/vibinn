ALTER TABLE "Place"
ADD COLUMN "googleDisplayName" TEXT,
ADD COLUMN "shortFormattedAddress" TEXT,
ADD COLUMN "googleTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "googlePrimaryType" TEXT,
ADD COLUMN "googlePrimaryTypeDisplayName" TEXT,
ADD COLUMN "googleMapsTypeLabel" TEXT,
ADD COLUMN "businessStatus" TEXT,
ADD COLUMN "openingDateJson" JSONB,
ADD COLUMN "userRatingCount" INTEGER,
ADD COLUMN "currentOpeningHours" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "servesCocktails" BOOLEAN,
ADD COLUMN "servesVegetarianFood" BOOLEAN,
ADD COLUMN "takeout" BOOLEAN,
ADD COLUMN "delivery" BOOLEAN,
ADD COLUMN "dineIn" BOOLEAN,
ADD COLUMN "curbsidePickup" BOOLEAN,
ADD COLUMN "reservable" BOOLEAN,
ADD COLUMN "liveMusic" BOOLEAN,
ADD COLUMN "menuForChildren" BOOLEAN,
ADD COLUMN "goodForChildren" BOOLEAN,
ADD COLUMN "allowsDogs" BOOLEAN,
ADD COLUMN "restroom" BOOLEAN,
ADD COLUMN "websiteUri" TEXT,
ADD COLUMN "addressComponentsJson" JSONB,
ADD COLUMN "photosJson" JSONB,
ADD COLUMN "reviewsJson" JSONB,
ADD COLUMN "paymentOptionsJson" JSONB,
ADD COLUMN "parkingOptionsJson" JSONB,
ADD COLUMN "accessibilityOptionsJson" JSONB,
ADD COLUMN "editorialSummaryJson" JSONB,
ADD COLUMN "reviewSummaryJson" JSONB,
ADD COLUMN "generativeSummaryJson" JSONB,
ADD COLUMN "googleMapsLinksJson" JSONB,
ADD COLUMN "containingPlacesJson" JSONB,
ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastGoogleFetchedAt" TIMESTAMP(3);

CREATE TABLE "PlaceDiscoverySignal" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "googlePlaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'GOOGLE_TEXT_SEARCH',
    "queryText" TEXT NOT NULL,
    "queryType" TEXT,
    "preferenceCategory" TEXT,
    "selectedVibe" TEXT,
    "resultRank" INTEGER,
    "bestResultRank" INTEGER,
    "locationLabel" TEXT,
    "locationType" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceDiscoverySignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaceDiscoverySignal_googlePlaceId_queryText_locationLabel_locationType_key"
ON "PlaceDiscoverySignal"("googlePlaceId", "queryText", "locationLabel", "locationType");

CREATE INDEX "PlaceDiscoverySignal_placeId_idx" ON "PlaceDiscoverySignal"("placeId");
CREATE INDEX "PlaceDiscoverySignal_preferenceCategory_idx" ON "PlaceDiscoverySignal"("preferenceCategory");
CREATE INDEX "PlaceDiscoverySignal_queryType_idx" ON "PlaceDiscoverySignal"("queryType");
CREATE INDEX "PlaceDiscoverySignal_locationLabel_locationType_idx" ON "PlaceDiscoverySignal"("locationLabel", "locationType");
CREATE INDEX "PlaceDiscoverySignal_lastSeenAt_idx" ON "PlaceDiscoverySignal"("lastSeenAt");

ALTER TABLE "PlaceDiscoverySignal"
ADD CONSTRAINT "PlaceDiscoverySignal_placeId_fkey"
FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
