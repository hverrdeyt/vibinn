-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHAT_MESSAGE';

-- AlterEnum
ALTER TYPE "TargetType" ADD VALUE IF NOT EXISTS 'CONVERSATION';

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'direct',
    "directUserAId" TEXT,
    "directUserBId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "momentId" TEXT,
    "previewText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_directUserAId_directUserBId_key" ON "Conversation"("directUserAId", "directUserBId");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_createdAt_idx" ON "ConversationMember"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_senderUserId_createdAt_idx" ON "ChatMessage"("senderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessageAttachment_messageId_idx" ON "ChatMessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "ChatMessageAttachment_targetType_targetId_idx" ON "ChatMessageAttachment"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_directUserAId_fkey" FOREIGN KEY ("directUserAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_directUserBId_fkey" FOREIGN KEY ("directUserBId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
