CREATE TABLE "UserPushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPushDevice_fcmToken_key" ON "UserPushDevice"("fcmToken");
CREATE INDEX "UserPushDevice_userId_isActive_idx" ON "UserPushDevice"("userId", "isActive");

ALTER TABLE "UserPushDevice"
ADD CONSTRAINT "UserPushDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
