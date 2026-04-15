-- AlterTable
ALTER TABLE "Place" ADD COLUMN "neighborhood" TEXT;
ALTER TABLE "Place" ADD COLUMN "adminAreaLevel4" TEXT;

-- CreateIndex
CREATE INDEX "Place_neighborhood_idx" ON "Place"("neighborhood");
CREATE INDEX "Place_adminAreaLevel4_idx" ON "Place"("adminAreaLevel4");

