import { Router } from 'express';
import { emailSchedulerService } from '../queues/email.scheduler.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

export const internalRouter = Router();

// Protect internal routes
internalRouter.use(requireAuth);

const internalParamsSchema = z.object({
  id: z.string().uuid('Invalid job ID format'),
});

internalRouter.post(
  '/email-jobs/:id/ensure-scheduled',
  validate({ params: internalParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await emailSchedulerService.ensureEmailJobScheduled(req.params['id'] as string);
    sendSuccess(res, result);
  }),
);
