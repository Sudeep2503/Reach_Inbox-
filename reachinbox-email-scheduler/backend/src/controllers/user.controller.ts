import type { Request, Response } from 'express';
import { userService } from '../services/user.service.js';
import { sendSuccess } from '../utils/response.js';
import { ApiError } from '../utils/apiError.js';

export const userController = {
  getUserById: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    if (req.user!.id !== id) {
      throw ApiError.notFound('User not found');
    }
    const user = await userService.getUserById(id);
    sendSuccess(res, user);
  },

  getUserSenders: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    if (req.user!.id !== id) {
      throw ApiError.notFound('User not found');
    }
    const senders = await userService.getUserSenders(id);
    sendSuccess(res, senders);
  },

  getUserCampaigns: async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    if (req.user!.id !== id) {
      throw ApiError.notFound('User not found');
    }
    const campaigns = await userService.getUserCampaigns(id);
    sendSuccess(res, campaigns);
  },
};
