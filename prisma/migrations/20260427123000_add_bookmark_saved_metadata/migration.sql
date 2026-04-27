ALTER TABLE "Bookmark"
ADD COLUMN "source" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "Bookmark_expiresAt_idx" ON "Bookmark"("expiresAt");
