-- AlterEnum
ALTER TYPE "RecipientStatus" ADD VALUE 'BOUNCED';

-- AlterTable
ALTER TABLE "campaign_messages" ADD COLUMN     "messageIdHeader" TEXT;

-- CreateTable
CREATE TABLE "processed_bounce_emails" (
    "gmailMessageId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_bounce_emails_pkey" PRIMARY KEY ("gmailMessageId")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_messages_messageIdHeader_key" ON "campaign_messages"("messageIdHeader");

