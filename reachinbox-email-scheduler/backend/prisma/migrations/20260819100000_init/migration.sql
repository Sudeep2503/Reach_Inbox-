-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "googleId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpUser" TEXT NOT NULL,
    "smtpPassword" TEXT NOT NULL,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "delayMs" INTEGER NOT NULL,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "scheduledCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_jobs" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "bullJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "senders_userId_idx" ON "senders"("userId");

-- CreateIndex
CREATE INDEX "senders_email_idx" ON "senders"("email");

-- CreateIndex
CREATE UNIQUE INDEX "senders_userId_email_key" ON "senders"("userId", "email");

-- CreateIndex
CREATE INDEX "campaigns_userId_idx" ON "campaigns"("userId");

-- CreateIndex
CREATE INDEX "campaigns_startTime_idx" ON "campaigns"("startTime");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_jobs_bullJobId_key" ON "email_jobs"("bullJobId");

-- CreateIndex
CREATE INDEX "email_jobs_campaignId_idx" ON "email_jobs"("campaignId");

-- CreateIndex
CREATE INDEX "email_jobs_senderId_idx" ON "email_jobs"("senderId");

-- CreateIndex
CREATE INDEX "email_jobs_recipient_idx" ON "email_jobs"("recipient");

-- CreateIndex
CREATE INDEX "email_jobs_scheduledAt_idx" ON "email_jobs"("scheduledAt");

-- CreateIndex
CREATE INDEX "email_jobs_status_idx" ON "email_jobs"("status");

-- CreateIndex
CREATE INDEX "email_jobs_status_scheduledAt_idx" ON "email_jobs"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "email_jobs_campaignId_status_idx" ON "email_jobs"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "senders" ADD CONSTRAINT "senders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
