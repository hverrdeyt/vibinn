CREATE TYPE "OnboardingStep" AS ENUM (
  'WELCOME',
  'INVITE_CONFIRMED',
  'PHONE_VERIFICATION',
  'PROFILE',
  'LOCATION_PERMISSION',
  'CONTACTS_PERMISSION',
  'FRIENDS',
  'FIRST_PLACE',
  'INVITE_SHARE',
  'COMPLETED'
);

ALTER TABLE "User"
ADD COLUMN "avatarUrl" TEXT;

CREATE TABLE "UserOnboardingState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentStep" "OnboardingStep" NOT NULL DEFAULT 'WELCOME',
  "completedSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "skippedSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inviteCodeValidated" BOOLEAN NOT NULL DEFAULT false,
  "inviteCodeValidatedAt" TIMESTAMP(3),
  "phoneVerifiedAt" TIMESTAMP(3),
  "profileCompletedAt" TIMESTAMP(3),
  "locationDecisionAt" TIMESTAMP(3),
  "contactsDecisionAt" TIMESTAMP(3),
  "firstPlaceLoggedAt" TIMESTAMP(3),
  "inviteShareSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserOnboardingState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserOnboardingState_userId_key" ON "UserOnboardingState"("userId");

ALTER TABLE "UserOnboardingState"
ADD CONSTRAINT "UserOnboardingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
