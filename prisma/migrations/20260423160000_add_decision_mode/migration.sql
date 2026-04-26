CREATE TABLE "DecisionSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "cityKey" TEXT NOT NULL,
    "cityLabel" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "entryMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "chosenPlaceId" TEXT,
    "userLatitude" DOUBLE PRECISION,
    "userLongitude" DOUBLE PRECISION,
    "swapCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DecisionSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionSessionOption" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "optionRank" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "scoreTotal" DOUBLE PRECISION,
    "scoreBreakdown" JSONB,
    "reasonLabel" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isSkipped" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionSessionOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "placeId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventValue" TEXT,
    "eventPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionSessionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionSave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DecisionSave_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionCheckinContext" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "intentId" TEXT,
    "ratingLabel" TEXT NOT NULL,
    "threeWordReview" TEXT,
    "unlockFeed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionCheckinContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionFeedUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unlockDate" TIMESTAMP(3) NOT NULL,
    "sourceMomentId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionFeedUnlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExperimentAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "experimentKey" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DecisionSessionOption_sessionId_optionRank_key" ON "DecisionSessionOption"("sessionId", "optionRank");
CREATE UNIQUE INDEX "DecisionSessionOption_sessionId_placeId_key" ON "DecisionSessionOption"("sessionId", "placeId");
CREATE UNIQUE INDEX "DecisionCheckinContext_sessionId_key" ON "DecisionCheckinContext"("sessionId");
CREATE UNIQUE INDEX "DecisionCheckinContext_momentId_key" ON "DecisionCheckinContext"("momentId");
CREATE UNIQUE INDEX "DecisionFeedUnlock_userId_unlockDate_key" ON "DecisionFeedUnlock"("userId", "unlockDate");
CREATE UNIQUE INDEX "ExperimentAssignment_userId_experimentKey_key" ON "ExperimentAssignment"("userId", "experimentKey");

CREATE INDEX "DecisionSession_userId_createdAt_idx" ON "DecisionSession"("userId", "createdAt");
CREATE INDEX "DecisionSession_cityKey_createdAt_idx" ON "DecisionSession"("cityKey", "createdAt");
CREATE INDEX "DecisionSession_status_createdAt_idx" ON "DecisionSession"("status", "createdAt");
CREATE INDEX "DecisionSessionOption_placeId_idx" ON "DecisionSessionOption"("placeId");
CREATE INDEX "DecisionSessionEvent_sessionId_createdAt_idx" ON "DecisionSessionEvent"("sessionId", "createdAt");
CREATE INDEX "DecisionSessionEvent_userId_createdAt_idx" ON "DecisionSessionEvent"("userId", "createdAt");
CREATE INDEX "DecisionSessionEvent_placeId_createdAt_idx" ON "DecisionSessionEvent"("placeId", "createdAt");
CREATE INDEX "DecisionSessionEvent_eventType_createdAt_idx" ON "DecisionSessionEvent"("eventType", "createdAt");
CREATE INDEX "DecisionSave_userId_status_createdAt_idx" ON "DecisionSave"("userId", "status", "createdAt");
CREATE INDEX "DecisionSave_expiresAt_idx" ON "DecisionSave"("expiresAt");
CREATE INDEX "DecisionCheckinContext_userId_createdAt_idx" ON "DecisionCheckinContext"("userId", "createdAt");
CREATE INDEX "DecisionCheckinContext_placeId_createdAt_idx" ON "DecisionCheckinContext"("placeId", "createdAt");
CREATE INDEX "DecisionFeedUnlock_expiresAt_idx" ON "DecisionFeedUnlock"("expiresAt");

ALTER TABLE "DecisionSession" ADD CONSTRAINT "DecisionSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionSessionOption" ADD CONSTRAINT "DecisionSessionOption_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DecisionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionSessionOption" ADD CONSTRAINT "DecisionSessionOption_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionSessionEvent" ADD CONSTRAINT "DecisionSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DecisionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionSessionEvent" ADD CONSTRAINT "DecisionSessionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionSessionEvent" ADD CONSTRAINT "DecisionSessionEvent_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionSave" ADD CONSTRAINT "DecisionSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionSave" ADD CONSTRAINT "DecisionSave_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DecisionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionSave" ADD CONSTRAINT "DecisionSave_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCheckinContext" ADD CONSTRAINT "DecisionCheckinContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DecisionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCheckinContext" ADD CONSTRAINT "DecisionCheckinContext_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCheckinContext" ADD CONSTRAINT "DecisionCheckinContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCheckinContext" ADD CONSTRAINT "DecisionCheckinContext_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionFeedUnlock" ADD CONSTRAINT "DecisionFeedUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
