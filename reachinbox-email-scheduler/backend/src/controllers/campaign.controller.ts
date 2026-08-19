import type { Request, Response } from 'express';
import type { EmailJobStatus } from '@prisma/client';
import { campaignService } from '../services/campaign.service.js';
import { createCampaignSchema } from '../schemas/campaign.schema.js';
import { getPaginationMeta, parsePagination } from '../utils/pagination.js';
import { sendCollection, sendSuccess } from '../utils/response.js';

export const campaignController = {
  getCampaignById: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user!.id;
    const campaign = await campaignService.getCampaignById(id, userId);
    sendSuccess(res, campaign);
  },

  listCampaigns: async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const campaigns = await campaignService.listCampaigns(userId);
    sendSuccess(res, campaigns);
  },

  getCampaignEmails: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user!.id;
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const senderId = req.query['senderId'] as string | undefined;
    const status = req.query['status'] as EmailJobStatus | undefined;

    const { total, items } = await campaignService.getCampaignEmails(
      id,
      userId,
      { skip: pagination.skip, take: pagination.take },
      {
        senderId,
        status,
      },
    );

    sendCollection(res, items, getPaginationMeta(total, pagination.page, pagination.limit));
  },

  getCampaignStats: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user!.id;
    const stats = await campaignService.getCampaignStats(id, userId);
    sendSuccess(res, stats);
  },

  createCampaign: async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const file = req.file;

    // Standardize multipart fields
    const rawData = {
      subject: req.body.subject,
      body: req.body.body,
      senderId: req.body.senderId,
      startTime: req.body.startTime,
      delayMs: req.body.delayMs !== undefined && req.body.delayMs !== '' ? Number(req.body.delayMs) : undefined,
      hourlyLimit: req.body.hourlyLimit !== undefined && req.body.hourlyLimit !== '' ? Number(req.body.hourlyLimit) : undefined,
    };

    // Validate payload against schema
    const validatedData = await createCampaignSchema.parseAsync(rawData);

    const result = await campaignService.createCampaign(userId, validatedData, file);
    sendSuccess(res, result, 201);
  },
};
