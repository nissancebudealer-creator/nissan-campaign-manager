-- DropIndex
DROP INDEX "campaign_messages_messageIdHeader_key";

-- AlterTable
ALTER TABLE "campaign_messages" DROP COLUMN "messageIdHeader";

