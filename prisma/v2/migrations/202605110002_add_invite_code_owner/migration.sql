ALTER TABLE "InviteCode"
ADD COLUMN "ownerUserId" TEXT;

UPDATE "InviteCode"
SET "ownerUserId" = "InviteRedemption"."userId"
FROM "InviteRedemption"
WHERE "InviteRedemption"."inviteCodeId" = "InviteCode"."id"
  AND "InviteCode"."ownerUserId" IS NULL;

DELETE FROM "InviteCode"
WHERE "ownerUserId" IS NULL;

ALTER TABLE "InviteCode"
ALTER COLUMN "ownerUserId" SET NOT NULL;

CREATE UNIQUE INDEX "InviteCode_ownerUserId_key" ON "InviteCode"("ownerUserId");

ALTER TABLE "InviteCode"
ADD CONSTRAINT "InviteCode_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
