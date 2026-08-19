import { Router } from 'express';
import { campaignController } from '../controllers/campaign.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validation.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { uploadLeads } from '../middleware/upload.js';
import {
  campaignEmailsQuerySchema,
  campaignParamsSchema,
  campaignQuerySchema,
} from '../schemas/campaign.schema.js';

export const campaignRouter = Router();

// Secure all campaign routes
campaignRouter.use(requireAuth);

campaignRouter.get(
  '/',
  validate({ query: campaignQuerySchema }),
  asyncHandler(campaignController.listCampaigns),
);

campaignRouter.get(
  '/:id',
  validate({ params: campaignParamsSchema }),
  asyncHandler(campaignController.getCampaignById),
);

campaignRouter.post(
  '/',
  uploadLeads,
  asyncHandler(campaignController.createCampaign),
);

campaignRouter.get(
  '/:id/emails',
  validate({ params: campaignParamsSchema, query: campaignEmailsQuerySchema }),
  asyncHandler(campaignController.getCampaignEmails),
);

campaignRouter.get(
  '/:id/stats',
  validate({ params: campaignParamsSchema }),
  asyncHandler(campaignController.getCampaignStats),
);
