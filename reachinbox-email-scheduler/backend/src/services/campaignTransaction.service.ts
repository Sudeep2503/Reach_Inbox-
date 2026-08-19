import type { Campaign, EmailJob } from '@prisma/client';
import { prisma } from '../config/database.js';
import { campaignRepository } from '../repositories/campaign.repository.js';
import { emailJobRepository } from '../repositories/emailJob.repository.js';

export interface CreateCampaignWithJobsInput {
  userId: string;
  subject: string;
  body: string;
  startTime: Date;
  delayMs: number;
  hourlyLimit?: number;
  senderId: string;
  recipients: string[];
}

export interface CreateCampaignWithJobsResult {
  campaign: Campaign;
  emailJobs: EmailJob[];
}

/**
 * Demonstrates atomic campaign + email job creation using a Prisma transaction.
 * Full campaign scheduling API will be added in a later phase.
 */
export async function createCampaignWithEmailJobs(
  input: CreateCampaignWithJobsInput,
): Promise<CreateCampaignWithJobsResult> {
  const { userId, subject, body, startTime, delayMs, hourlyLimit, senderId, recipients } = input;

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        user: { connect: { id: userId } },
        subject,
        body,
        startTime,
        delayMs,
        hourlyLimit: hourlyLimit ?? 200,
        status: 'DRAFT',
        totalRecipients: recipients.length,
        scheduledCount: recipients.length,
      },
    });

    const emailJobs = await Promise.all(
      recipients.map((recipient, index) =>
        tx.emailJob.create({
          data: {
            campaign: { connect: { id: campaign.id } },
            sender: { connect: { id: senderId } },
            recipient,
            subject,
            body,
            scheduledAt: new Date(startTime.getTime() + index * delayMs),
            status: 'SCHEDULED',
          },
        }),
      ),
    );

    return { campaign, emailJobs };
  });
}

export const campaignTransactionService = {
  createCampaignWithEmailJobs,
  campaignRepository,
  emailJobRepository,
};
