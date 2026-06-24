CREATE TABLE "UserPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "selectedInterests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "selectedVibe" TEXT,
  "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
  "skippedPreferences" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

ALTER TABLE "UserPreference"
ADD CONSTRAINT "UserPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserAccountSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserAccountSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAccountSettings_userId_key" ON "UserAccountSettings"("userId");

ALTER TABLE "UserAccountSettings"
ADD CONSTRAINT "UserAccountSettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserPrivacySettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profileVisibility" "MomentVisibility" NOT NULL DEFAULT 'PUBLIC',
  "momentVisibility" "MomentVisibility" NOT NULL DEFAULT 'PUBLIC',
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPrivacySettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPrivacySettings_userId_key" ON "UserPrivacySettings"("userId");

ALTER TABLE "UserPrivacySettings"
ADD CONSTRAINT "UserPrivacySettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Bookmark" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "source" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bookmark_userId_placeId_key" ON "Bookmark"("userId", "placeId");
CREATE INDEX "Bookmark_expiresAt_idx" ON "Bookmark"("expiresAt");

ALTER TABLE "Bookmark"
ADD CONSTRAINT "Bookmark_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bookmark"
ADD CONSTRAINT "Bookmark_placeId_fkey"
FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DismissedPlace" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DismissedPlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DismissedPlace_userId_placeId_key" ON "DismissedPlace"("userId", "placeId");

ALTER TABLE "DismissedPlace"
ADD CONSTRAINT "DismissedPlace_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DismissedPlace"
ADD CONSTRAINT "DismissedPlace_placeId_fkey"
FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Collection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverImageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Collection"
ADD CONSTRAINT "Collection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CollectionPlace" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "CollectionPlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionPlace_collectionId_placeId_key" ON "CollectionPlace"("collectionId", "placeId");

ALTER TABLE "CollectionPlace"
ADD CONSTRAINT "CollectionPlace_collectionId_fkey"
FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionPlace"
ADD CONSTRAINT "CollectionPlace_placeId_fkey"
FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
