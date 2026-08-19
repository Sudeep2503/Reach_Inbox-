import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validation.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { userParamsSchema } from '../schemas/user.schema.js';

export const userRouter = Router();

// Protect dev-only user endpoints
userRouter.use(requireAuth);

userRouter.get(
  '/:id',
  validate({ params: userParamsSchema }),
  asyncHandler(userController.getUserById),
);

userRouter.get(
  '/:id/senders',
  validate({ params: userParamsSchema }),
  asyncHandler(userController.getUserSenders),
);

userRouter.get(
  '/:id/campaigns',
  validate({ params: userParamsSchema }),
  asyncHandler(userController.getUserCampaigns),
);
