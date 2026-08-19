import type { Request, Response } from 'express';
import type { EmailJobStatus } from '@prisma/client';
import { emailJobService } from '../services/emailJob.service.js';
import { getPaginationMeta, parsePagination } from '../utils/pagination.js';
import { sendCollection, sendSuccess } from '../utils/response.js';

export const emailJobController = {
  getEmailJobById: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user!.id;
    const job = await emailJobService.getEmailJobById(id, userId);

    const sanitizedJob = {
      id: job.id,
      recipient: job.recipient,
      subject: job.subject,
      status: job.status,
      scheduledAt: job.scheduledAt,
      sentAt: job.sentAt,
      failedAt: job.failedAt,
      attempts: job.attempts,
      previewUrl: job.previewUrl,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      nextAttemptAt: job.nextAttemptAt,
      rateLimitReschedules: job.rateLimitReschedules,
    };

    sendSuccess(res, sanitizedJob);
  },

  getScheduledEmails: async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const campaignId = req.query['campaignId'] as string | undefined;
    const senderId = req.query['senderId'] as string | undefined;
    const status = req.query['status'] as EmailJobStatus | undefined;

    const { total, items } = await emailJobService.getScheduledEmails(
      userId,
      { skip: pagination.skip, take: pagination.take },
      {
        campaignId,
        senderId,
        status,
      },
    );

    const sanitizedItems = items.map((item) => ({
      id: item.id,
      recipient: item.recipient,
      subject: item.subject,
      scheduledAt: item.scheduledAt,
      status: item.status,
      campaignId: item.campaignId,
      senderId: item.senderId,
      nextAttemptAt: item.nextAttemptAt,
      rateLimitReschedules: item.rateLimitReschedules,
    }));

    sendCollection(res, sanitizedItems, getPaginationMeta(total, pagination.page, pagination.limit));
  },

  getSentEmails: async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const campaignId = req.query['campaignId'] as string | undefined;
    const senderId = req.query['senderId'] as string | undefined;
    const status = req.query['status'] as EmailJobStatus | undefined;

    const { total, items } = await emailJobService.getSentEmails(
      userId,
      { skip: pagination.skip, take: pagination.take },
      {
        campaignId,
        senderId,
        status,
      },
    );

    const sanitizedItems = items.map((item) => ({
      id: item.id,
      recipient: item.recipient,
      subject: item.subject,
      sentAt: item.sentAt,
      status: item.status,
      previewUrl: item.previewUrl,
      attempts: item.attempts,
      failedAt: item.failedAt,
      errorMessage: item.errorMessage,
      nextAttemptAt: item.nextAttemptAt,
      rateLimitReschedules: item.rateLimitReschedules,
    }));

    sendCollection(res, sanitizedItems, getPaginationMeta(total, pagination.page, pagination.limit));
  },
};
