-- DropForeignKey
ALTER TABLE "campaign_recipients" DROP CONSTRAINT "campaign_recipients_contactId_fkey";

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
