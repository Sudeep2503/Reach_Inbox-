import { campaignRepository } from '../repositories/campaign.repository.js';
import { emailJobRepository } from '../repositories/emailJob.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { senderRepository } from '../repositories/sender.repository.js';
import { recipientParserService } from './recipientParser.service.js';
import { emailSchedulerService } from '../queues/email.scheduler.js';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../config/logger.js';
import type { EmailJobStatus } from '@prisma/client';

export interface CreateCampaignPayload {
  subject: string;
  body: string;
  senderId: string;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
}

export const campaignService = {
  async getCampaignById(id: string, userId: string) {
    const campaign = await campaignRepository.findCampaignByIdForUser(id, userId);
    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }
    return campaign;
  },

  async listCampaigns(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return campaignRepository.findByUserId(userId);
  },

  async getCampaignEmails(
    campaignId: string,
    userId: string,
    pagination: { skip: number; take: number },
    filters: { senderId?: string; status?: EmailJobStatus },
  ) {
    const campaign = await campaignRepository.findCampaignByIdForUser(campaignId, userId);
    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }

    const [total, items] = await Promise.all([
      emailJobRepository.countCampaignEmails(campaignId, userId, filters),
      emailJobRepository.findCampaignEmailsPaginated(campaignId, userId, pagination.skip, pagination.take, filters),
    ]);

    return { total, items };
  },

  async getCampaignStats(campaignId: string, userId: string) {
    const campaign = await campaignRepository.findCampaignByIdForUser(campaignId, userId);
    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }

    const total = campaign.totalRecipients;
    const sent = campaign.sentCount;
    const completionPercentage = total === 0 ? 0 : Math.round((sent / total) * 100);

    return {
      totalRecipients: campaign.totalRecipients,
      scheduledCount: campaign.scheduledCount,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      completionPercentage,
    };
  },

  async createCampaign(
    userId: string,
    payload: CreateCampaignPayload,
    file?: { buffer: Buffer; originalname: string },
  ) {
    // 1. Verify sender
    const sender = await senderRepository.findSenderByIdForUser(payload.senderId, userId);
    if (!sender) {
      throw ApiError.notFound('Sender not found');
    }
    if (!sender.isActive) {
      throw ApiError.badRequest('Sender is inactive', 'SENDER_INACTIVE');
    }

    // 2. Validate lead file presence
    if (!file) {
      throw ApiError.badRequest('Leads file is required.', 'MISSING_FILE');
    }

    // 3. Parse leads list
    const parseResult = recipientParserService.parseRecipients(file.buffer, file.originalname);
    const { validEmails } = parseResult;

    if (validEmails.length === 0) {
      throw ApiError.badRequest('No valid email addresses were found.', 'NO_VALID_RECIPIENTS');
    }

    // 4. Atomically persist via Transaction
    const campaign = await prisma.$transaction(async (tx) => {
      // 4.a Create Campaign (note: Campaign model does not contain a senderId column directly)
      const camp = await tx.campaign.create({
        data: {
          userId,
          subject: payload.subject,
          body: payload.body,
          startTime: new Date(payload.startTime),
          delayMs: payload.delayMs,
          hourlyLimit: payload.hourlyLimit,
          status: 'SCHEDULED',
          totalRecipients: validEmails.length,
          scheduledCount: validEmails.length,
          sentCount: 0,
          failedCount: 0,
        },
      });

      // 4.b Prepare email job schedules
      const emailJobsData = validEmails.map((email, index) => {
        const scheduledAt = new Date(new Date(payload.startTime).getTime() + index * payload.delayMs);
        return {
          campaignId: camp.id,
          senderId: payload.senderId,
          recipient: email,
          subject: payload.subject,
          body: payload.body,
          scheduledAt,
          status: 'SCHEDULED' as const,
          attempts: 0,
        };
      });

      // 4.c Bulk insert in chunked batches
      const batchSize = env.BATCH_INSERT_SIZE;
      for (let i = 0; i < emailJobsData.length; i += batchSize) {
        const chunk = emailJobsData.slice(i, i + batchSize);
        await tx.emailJob.createMany({
          data: chunk,
        });
      }

      return camp;
    });

    // 5. Enqueue email jobs in BullMQ after PostgreSQL transaction commits successfully
    let scheduledCount = 0;
    let failedCount = 0;

    try {
      const scheduleResult = await emailSchedulerService.scheduleCampaign(campaign.id);
      scheduledCount = scheduleResult.scheduledCount;
      failedCount = scheduleResult.failedCount;
    } catch (error) {
      logger.error({ err: error, campaignId: campaign.id }, 'Post-transaction BullMQ scheduling failed');
      failedCount = campaign.totalRecipients;
    }

    return {
      campaign,
      recipients: parseResult.summary,
      queue: {
        scheduled: scheduledCount,
        failed: failedCount,
      },
    };
  },
};
