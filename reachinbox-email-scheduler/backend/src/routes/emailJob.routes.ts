import { Router } from 'express';
import { emailJobController } from '../controllers/emailJob.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validation.js';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  emailJobParamsSchema,
  scheduledEmailsQuerySchema,
  sentEmailsQuerySchema,
} from '../schemas/emailJob.schema.js';

export const emailJobRouter = Router();

// Secure all email job routes
emailJobRouter.use(requireAuth);

emailJobRouter.get(
  '/scheduled',
  validate({ query: scheduledEmailsQuerySchema }),
  asyncHandler(emailJobController.getScheduledEmails),
);

emailJobRouter.get(
  '/sent',
  validate({ query: sentEmailsQuerySchema }),
  asyncHandler(emailJobController.getSentEmails),
);

emailJobRouter.get(
  '/:id',
  validate({ params: emailJobParamsSchema }),
  asyncHandler(emailJobController.getEmailJobById),
);
