CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Follow_sourceUserId_targetUserId_key" ON "Follow"("sourceUserId", "targetUserId");
CREATE INDEX "Follow_sourceUserId_createdAt_idx" ON "Follow"("sourceUserId", "createdAt");
CREATE INDEX "Follow_targetUserId_createdAt_idx" ON "Follow"("targetUserId", "createdAt");

ALTER TABLE "Follow" ADD CONSTRAINT "Follow_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
