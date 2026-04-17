ALTER TABLE "Place"
ADD COLUMN "openingHours" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "servesBreakfast" BOOLEAN,
ADD COLUMN "servesLunch" BOOLEAN,
ADD COLUMN "servesDinner" BOOLEAN,
ADD COLUMN "servesBeer" BOOLEAN,
ADD COLUMN "servesWine" BOOLEAN,
ADD COLUMN "servesBrunch" BOOLEAN,
ADD COLUMN "servesDessert" BOOLEAN,
ADD COLUMN "servesCoffee" BOOLEAN,
ADD COLUMN "goodForGroups" BOOLEAN,
ADD COLUMN "goodForWatchingSports" BOOLEAN,
ADD COLUMN "timeZoneId" TEXT,
ADD COLUMN "utcOffsetMinutes" INTEGER,
ADD COLUMN "outdoorSeating" BOOLEAN;

