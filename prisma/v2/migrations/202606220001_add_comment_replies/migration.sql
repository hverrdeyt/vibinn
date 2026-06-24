ALTER TABLE "Comment"
ADD COLUMN "parentCommentId" TEXT;

CREATE INDEX "Comment_parentCommentId_createdAt_idx"
ON "Comment"("parentCommentId", "createdAt");

ALTER TABLE "Comment"
ADD CONSTRAINT "Comment_parentCommentId_fkey"
FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
