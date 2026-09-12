-- DropForeignKey
ALTER TABLE "automation_rules" DROP CONSTRAINT "automation_rules_createdById_fkey";

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_createdById_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_createdById_fkey";

-- DropForeignKey
ALTER TABLE "segments" DROP CONSTRAINT "segments_createdById_fkey";

-- DropForeignKey
ALTER TABLE "templates" DROP CONSTRAINT "templates_createdById_fkey";

-- AlterTable
ALTER TABLE "automation_rules" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "campaigns" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "contacts" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "segments" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "templates" ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
