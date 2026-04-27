-- CreateTable
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "sourceMomentId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "caption" TEXT NOT NULL,
    "privacy" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedPost_sourceMomentId_key" ON "FeedPost"("sourceMomentId");

-- CreateIndex
CREATE INDEX "FeedPost_userId_visitedAt_idx" ON "FeedPost"("userId", "visitedAt");

-- CreateIndex
CREATE INDEX "FeedPost_placeId_visitedAt_idx" ON "FeedPost"("placeId", "visitedAt");

-- CreateIndex
CREATE INDEX "FeedPost_privacy_visitedAt_idx" ON "FeedPost"("privacy", "visitedAt");

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_sourceMomentId_fkey" FOREIGN KEY ("sourceMomentId") REFERENCES "Moment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
