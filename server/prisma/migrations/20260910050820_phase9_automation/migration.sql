-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('NEW_CONTACT', 'LEAD_STATUS_CHANGED', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationStepStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "triggerValue" TEXT,
DROP COLUMN "triggerType",
ADD COLUMN     "triggerType" "AutomationTriggerType" NOT NULL;

-- CreateTable
CREATE TABLE "automation_enrollments" (
    "id" TEXT NOT NULL,
    "automationRuleId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextStepDueAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "automation_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_step_logs" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "AutomationStepStatus" NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_step_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_enrollments_status_nextStepDueAt_idx" ON "automation_enrollments"("status", "nextStepDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_enrollments_automationRuleId_contactId_key" ON "automation_enrollments"("automationRuleId", "contactId");

-- AddForeignKey
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_step_logs" ADD CONSTRAINT "automation_step_logs_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "automation_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

