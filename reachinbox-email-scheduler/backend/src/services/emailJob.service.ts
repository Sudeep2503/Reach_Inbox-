import { emailJobRepository } from '../repositories/emailJob.repository.js';
import { ApiError } from '../utils/apiError.js';
import type { EmailJobStatus } from '@prisma/client';

export const emailJobService = {
  async getEmailJobById(id: string, userId: string) {
    const job = await emailJobRepository.findEmailJobByIdForUser(id, userId);
    if (!job) {
      throw ApiError.notFound('Email job not found');
    }
    return job;
  },

  async getScheduledEmails(
    userId: string,
    pagination: { skip: number; take: number },
    filters: { campaignId?: string; senderId?: string; status?: EmailJobStatus },
  ) {
    const [total, items] = await Promise.all([
      emailJobRepository.countScheduled(userId, filters),
      emailJobRepository.findScheduledPaginated(userId, pagination.skip, pagination.take, filters),
    ]);

    return { total, items };
  },

  async getSentEmails(
    userId: string,
    pagination: { skip: number; take: number },
    filters: { campaignId?: string; senderId?: string; status?: EmailJobStatus },
  ) {
    const [total, items] = await Promise.all([
      emailJobRepository.countSent(userId, filters),
      emailJobRepository.findSentPaginated(userId, pagination.skip, pagination.take, filters),
    ]);

    return { total, items };
  },
};
