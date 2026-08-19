import type { Campaign, CampaignStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { CreateCampaignInput, UpdateCampaignInput } from '../types/database.js';

export const campaignRepository = {
  create(data: CreateCampaignInput): Promise<Campaign> {
    return prisma.campaign.create({ data });
  },

  findById(id: string): Promise<Campaign | null> {
    return prisma.campaign.findUnique({ where: { id } });
  },

  findCampaignByIdForUser(id: string, userId: string): Promise<Campaign | null> {
    return prisma.campaign.findFirst({
      where: { id, userId },
    });
  },

  findByUserId(userId: string): Promise<Campaign[]> {
    return prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  findAll(): Promise<Campaign[]> {
    return prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  update(id: string, data: UpdateCampaignInput): Promise<Campaign> {
    return prisma.campaign.update({ where: { id }, data });
  },

  updateStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    return prisma.campaign.update({
      where: { id },
      data: { status },
    });
  },

  updateCounters(
    id: string,
    counters: {
      totalRecipients?: number;
      scheduledCount?: number;
      sentCount?: number;
      failedCount?: number;
    },
  ): Promise<Campaign> {
    return prisma.campaign.update({
      where: { id },
      data: counters,
    });
  },
};
