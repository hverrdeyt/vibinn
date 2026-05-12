CREATE TYPE "UserStatus" AS ENUM ('PENDING_PROFILE', 'ACTIVE', 'SUSPENDED');

CREATE TYPE "OtpPurpose" AS ENUM ('SIGN_UP', 'SIGN_IN');

CREATE TYPE "OtpProvider" AS ENUM ('VONAGE_VERIFY');

CREATE TYPE "OtpRequestStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "InviteCodeStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXHAUSTED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "phoneNumberE164" TEXT NOT NULL,
  "displayName" TEXT,
  "username" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING_PROFILE',
  "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OtpRequest" (
  "id" TEXT NOT NULL,
  "phoneNumberE164" TEXT NOT NULL,
  "purpose" "OtpPurpose" NOT NULL,
  "provider" "OtpProvider" NOT NULL,
  "providerRequestId" TEXT NOT NULL,
  "status" "OtpRequestStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "resendCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OtpRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT,
  "status" "InviteCodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "maxRedemptions" INTEGER,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteRedemption" (
  "id" TEXT NOT NULL,
  "inviteCodeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneNumberE164" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InviteRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_phoneNumberE164_key" ON "User"("phoneNumberE164");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE UNIQUE INDEX "OtpRequest_providerRequestId_key" ON "OtpRequest"("providerRequestId");
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");
CREATE UNIQUE INDEX "InviteRedemption_userId_key" ON "InviteRedemption"("userId");

CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "OtpRequest_phoneNumberE164_purpose_createdAt_idx" ON "OtpRequest"("phoneNumberE164", "purpose", "createdAt");
CREATE INDEX "OtpRequest_status_expiresAt_idx" ON "OtpRequest"("status", "expiresAt");
CREATE INDEX "OtpRequest_expiresAt_idx" ON "OtpRequest"("expiresAt");
CREATE INDEX "InviteCode_status_expiresAt_idx" ON "InviteCode"("status", "expiresAt");
CREATE INDEX "InviteRedemption_inviteCodeId_redeemedAt_idx" ON "InviteRedemption"("inviteCodeId", "redeemedAt");
CREATE INDEX "InviteRedemption_phoneNumberE164_redeemedAt_idx" ON "InviteRedemption"("phoneNumberE164", "redeemedAt");

ALTER TABLE "Session"
ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InviteRedemption"
ADD CONSTRAINT "InviteRedemption_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InviteRedemption"
ADD CONSTRAINT "InviteRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
