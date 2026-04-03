-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('MANUAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('CITY', 'PROVINCE', 'COUNTRY');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'FOLLOWERS');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('SOLO', 'COUPLE', 'FRIENDS', 'FAMILY');

-- CreateEnum
CREATE TYPE "TimeOfDay" AS ENUM ('MORNING', 'AFTERNOON', 'SUNSET', 'NIGHT');

-- CreateEnum
CREATE TYPE "RevisitIntent" AS ENUM ('YES', 'NOT_SURE', 'NOT_INTERESTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PLACE_MATCH', 'TRAVELER_OVERLAP', 'COMMENT', 'VIBIN', 'FOLLOW', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('PROFILE', 'MOMENT', 'PLACE', 'PLACE_VISIT', 'COLLECTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "bio" TEXT NOT NULL,
    "avatarUrl" TEXT NOT NULL,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'MANUAL',
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedInterests" TEXT[],
    "selectedVibe" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "skippedPreferences" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccountSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccountSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recommendationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPrivacySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileVisibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "momentVisibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPrivacySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "countryCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "googlePlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSavedLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSavedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "category" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION,
    "priceLevel" INTEGER,
    "primaryImageUrl" TEXT,
    "mapsEmbedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceMedia" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "source" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceAiEnrichment" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "description" TEXT,
    "vibeTags" TEXT[],
    "attitudeLabel" TEXT,
    "bestTime" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceAiEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlaceScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "matchScore" INTEGER,
    "similarityPercentage" INTEGER,
    "recommendationReason" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "sourceVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlaceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DismissedPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelerSimilarity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "relevanceReason" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelerSimilarity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "budgetLevel" TEXT NOT NULL,
    "visitType" "VisitType" NOT NULL,
    "timeOfDay" "TimeOfDay" NOT NULL,
    "privacy" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "wouldRevisit" "RevisitIntent" NOT NULL,
    "vibeTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomentMedia" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "CollectionPlace" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionMoment" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "momentId" TEXT,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vibin" (
    "id" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "receiverUserId" TEXT,
    "momentId" TEXT,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vibin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "NotificationType" NOT NULL,
    "targetType" "TargetType",
    "targetId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccountSettings_userId_key" ON "UserAccountSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationSettings_userId_key" ON "UserNotificationSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPrivacySettings_userId_key" ON "UserPrivacySettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_googlePlaceId_key" ON "Location"("googlePlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSavedLocation_userId_locationId_key" ON "UserSavedLocation"("userId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Place_googlePlaceId_key" ON "Place"("googlePlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceAiEnrichment_placeId_key" ON "PlaceAiEnrichment"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlaceScore_userId_placeId_key" ON "UserPlaceScore"("userId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_placeId_key" ON "Bookmark"("userId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "DismissedPlace_userId_placeId_key" ON "DismissedPlace"("userId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_sourceUserId_targetUserId_key" ON "Follow"("sourceUserId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelerSimilarity_userId_travelerId_key" ON "TravelerSimilarity"("userId", "travelerId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPlace_collectionId_placeId_key" ON "CollectionPlace"("collectionId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionMoment_collectionId_momentId_key" ON "CollectionMoment"("collectionId", "momentId");

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFlag" ADD CONSTRAINT "UserFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccountSettings" ADD CONSTRAINT "UserAccountSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationSettings" ADD CONSTRAINT "UserNotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrivacySettings" ADD CONSTRAINT "UserPrivacySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedLocation" ADD CONSTRAINT "UserSavedLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedLocation" ADD CONSTRAINT "UserSavedLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceMedia" ADD CONSTRAINT "PlaceMedia_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceAiEnrichment" ADD CONSTRAINT "PlaceAiEnrichment_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlaceScore" ADD CONSTRAINT "UserPlaceScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlaceScore" ADD CONSTRAINT "UserPlaceScore_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedPlace" ADD CONSTRAINT "DismissedPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedPlace" ADD CONSTRAINT "DismissedPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelerSimilarity" ADD CONSTRAINT "TravelerSimilarity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelerSimilarity" ADD CONSTRAINT "TravelerSimilarity_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentMedia" ADD CONSTRAINT "MomentMedia_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPlace" ADD CONSTRAINT "CollectionPlace_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPlace" ADD CONSTRAINT "CollectionPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionMoment" ADD CONSTRAINT "CollectionMoment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionMoment" ADD CONSTRAINT "CollectionMoment_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vibin" ADD CONSTRAINT "Vibin_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vibin" ADD CONSTRAINT "Vibin_receiverUserId_fkey" FOREIGN KEY ("receiverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vibin" ADD CONSTRAINT "Vibin_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
