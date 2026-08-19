import { Router } from 'express';
import { senderController } from '../controllers/sender.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validation.js';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  createSenderSchema,
  senderParamsSchema,
  senderQuerySchema,
  updateSenderSchema,
} from '../schemas/sender.schema.js';

export const senderRouter = Router();

// Secure all sender routes
senderRouter.use(requireAuth);

senderRouter.get(
  '/',
  validate({ query: senderQuerySchema }),
  asyncHandler(senderController.listSenders),
);

senderRouter.get(
  '/:id',
  validate({ params: senderParamsSchema }),
  asyncHandler(senderController.getSenderById),
);

senderRouter.post(
  '/',
  validate({ body: createSenderSchema }),
  asyncHandler(senderController.createSender),
);

senderRouter.patch(
  '/:id',
  validate({ params: senderParamsSchema, body: updateSenderSchema }),
  asyncHandler(senderController.updateSender),
);

senderRouter.get(
  '/:id/rate-limit',
  validate({ params: senderParamsSchema }),
  asyncHandler(senderController.getSenderRateLimitStatus),
);
