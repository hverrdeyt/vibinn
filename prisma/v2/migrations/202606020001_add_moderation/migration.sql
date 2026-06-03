CREATE TABLE "UserBlock" (
  "id" TEXT NOT NULL,
  "sourceUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserReport" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" "TargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBlock_sourceUserId_targetUserId_key" ON "UserBlock"("sourceUserId", "targetUserId");
CREATE INDEX "UserBlock_sourceUserId_createdAt_idx" ON "UserBlock"("sourceUserId", "createdAt");
CREATE INDEX "UserBlock_targetUserId_createdAt_idx" ON "UserBlock"("targetUserId", "createdAt");

CREATE INDEX "UserReport_reporterId_createdAt_idx" ON "UserReport"("reporterId", "createdAt");
CREATE INDEX "UserReport_targetType_targetId_createdAt_idx" ON "UserReport"("targetType", "targetId", "createdAt");
CREATE INDEX "UserReport_targetUserId_createdAt_idx" ON "UserReport"("targetUserId", "createdAt");

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_sourceUserId_fkey"
FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserReport"
ADD CONSTRAINT "UserReport_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserReport"
ADD CONSTRAINT "UserReport_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
