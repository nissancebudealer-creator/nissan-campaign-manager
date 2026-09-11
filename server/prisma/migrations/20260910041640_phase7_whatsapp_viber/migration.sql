-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "whatsappTemplateLanguage" TEXT DEFAULT 'en',
ADD COLUMN     "whatsappTemplateName" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "viberSubscribedAt" TIMESTAMP(3),
ADD COLUMN     "viberUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contacts_viberUserId_key" ON "contacts"("viberUserId");

