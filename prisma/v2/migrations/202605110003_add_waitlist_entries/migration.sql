CREATE TABLE "WaitlistEntry" (
  "id" TEXT NOT NULL,
  "phoneNumberE164" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaitlistEntry_phoneNumberE164_key" ON "WaitlistEntry"("phoneNumberE164");
