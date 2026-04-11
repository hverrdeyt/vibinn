ALTER TYPE "AuthProvider" ADD VALUE 'APPLE';

ALTER TABLE "User"
ADD COLUMN "appleSubject" TEXT;

CREATE UNIQUE INDEX "User_appleSubject_key" ON "User"("appleSubject");
