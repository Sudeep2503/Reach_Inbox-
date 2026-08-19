import type { Request, Response } from 'express';
import { senderService } from '../services/sender.service.js';
import { rateLimitService } from '../services/rate-limit/rate-limit.service.js';
import { sendSuccess } from '../utils/response.js';

export const senderController = {
  getSenderById: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user!.id;
    const sender = await senderService.getSenderById(id, userId);
    sendSuccess(res, sender);
  },

  listSenders: async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const senders = await senderService.listSenders(userId);
    sendSuccess(res, senders);
  },

  createSender: async (req: Request, res: Response): Promise<void> => {
    const payload = { ...req.body, userId: req.user!.id };
    const sender = await senderService.createSender(payload);
    sendSuccess(res, sender, 201);
  },

  updateSender: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user!.id;
    const sender = await senderService.updateSender(id, userId, req.body);
    sendSuccess(res, sender);
  },

  getSenderRateLimitStatus: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user!.id;
    await senderService.getSenderById(id, userId);
    const status = await rateLimitService.getSenderRateLimitStatus(id);
    sendSuccess(res, status);
  },
};
