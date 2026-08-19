import type { EmailJob, EmailJobStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { CreateEmailJobInput } from '../types/database.js';

export const emailJobRepository = {
  create(data: CreateEmailJobInput): Promise<EmailJob> {
    return prisma.emailJob.create({ data });
  },

  createMany(data: Prisma.EmailJobCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return prisma.emailJob.createMany({ data });
  },

  findById(id: string): Promise<EmailJob | null> {
    return prisma.emailJob.findUnique({ where: { id } });
  },

  findEmailJobByIdForUser(id: string, userId: string): Promise<EmailJob | null> {
    return prisma.emailJob.findFirst({
      where: {
        id,
        campaign: {
          userId,
        },
      },
    });
  },

  findByCampaign(campaignId: string): Promise<EmailJob[]> {
    return prisma.emailJob.findMany({
      where: { campaignId },
      orderBy: { scheduledAt: 'asc' },
    });
  },

  findScheduled(limit = 100): Promise<EmailJob[]> {
    return prisma.emailJob.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  },

  updateStatus(id: string, status: EmailJobStatus): Promise<EmailJob> {
    return prisma.emailJob.update({
      where: { id },
      data: { status },
    });
  },

  async claimForProcessing(emailJobId: string): Promise<boolean> {
    const result = await prisma.emailJob.updateMany({
      where: {
        id: emailJobId,
        status: 'SCHEDULED',
      },
      data: {
        status: 'PROCESSING',
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    return result.count > 0;
  },

  async markProcessing(emailJobId: string): Promise<boolean> {
    return this.claimForProcessing(emailJobId);
  },

  markSent(emailJobId: string): Promise<EmailJob> {
    return prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
  },

  markFailed(emailJobId: string, errorCode: string, errorMessage: string): Promise<EmailJob> {
    return prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorCode,
        errorMessage,
      },
    });
  },

  // Pagination & Filtering Extensions (with strict user ownership checks)

  countCampaignEmails(
    campaignId: string,
    userId: string,
    filters: { senderId?: string; status?: EmailJobStatus },
  ): Promise<number> {
    const where: Prisma.EmailJobWhereInput = {
      campaignId,
      campaign: {
        userId,
      },
      ...(filters.senderId && { senderId: filters.senderId }),
      ...(filters.status && { status: filters.status }),
    };
    return prisma.emailJob.count({ where });
  },

  findCampaignEmailsPaginated(
    campaignId: string,
    userId: string,
    skip: number,
    take: number,
    filters: { senderId?: string; status?: EmailJobStatus },
  ): Promise<EmailJob[]> {
    const where: Prisma.EmailJobWhereInput = {
      campaignId,
      campaign: {
        userId,
      },
      ...(filters.senderId && { senderId: filters.senderId }),
      ...(filters.status && { status: filters.status }),
    };
    return prisma.emailJob.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip,
      take,
    });
  },

  countScheduled(
    userId: string,
    filters: { campaignId?: string; senderId?: string; status?: EmailJobStatus },
  ): Promise<number> {
    const where: Prisma.EmailJobWhereInput = {
      status: filters.status || { in: ['SCHEDULED', 'PROCESSING'] },
      campaign: {
        userId,
      },
      ...(filters.campaignId && { campaignId: filters.campaignId }),
      ...(filters.senderId && { senderId: filters.senderId }),
    };
    return prisma.emailJob.count({ where });
  },

  findScheduledPaginated(
    userId: string,
    skip: number,
    take: number,
    filters: { campaignId?: string; senderId?: string; status?: EmailJobStatus },
  ): Promise<EmailJob[]> {
    const where: Prisma.EmailJobWhereInput = {
      status: filters.status || { in: ['SCHEDULED', 'PROCESSING'] },
      campaign: {
        userId,
      },
      ...(filters.campaignId && { campaignId: filters.campaignId }),
      ...(filters.senderId && { senderId: filters.senderId }),
    };
    return prisma.emailJob.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip,
      take,
    });
  },

  countSent(
    userId: string,
    filters: { campaignId?: string; senderId?: string; status?: EmailJobStatus },
  ): Promise<number> {
    const where: Prisma.EmailJobWhereInput = {
      status: filters.status || { in: ['SENT', 'FAILED'] },
      campaign: {
        userId,
      },
      ...(filters.campaignId && { campaignId: filters.campaignId }),
      ...(filters.senderId && { senderId: filters.senderId }),
    };
    return prisma.emailJob.count({ where });
  },

  findSentPaginated(
    userId: string,
    skip: number,
    take: number,
    filters: { campaignId?: string; senderId?: string; status?: EmailJobStatus },
  ): Promise<EmailJob[]> {
    const where: Prisma.EmailJobWhereInput = {
      status: filters.status || { in: ['SENT', 'FAILED'] },
      campaign: {
        userId,
      },
      ...(filters.campaignId && { campaignId: filters.campaignId }),
      ...(filters.senderId && { senderId: filters.senderId }),
    };
    return prisma.emailJob.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip,
      take,
    });
  },
};
