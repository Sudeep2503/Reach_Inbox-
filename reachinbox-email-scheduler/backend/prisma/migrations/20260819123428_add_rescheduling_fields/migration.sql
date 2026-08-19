-- AlterTable
ALTER TABLE "email_jobs" ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "rateLimitReschedules" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduleVersion" INTEGER NOT NULL DEFAULT 1;
