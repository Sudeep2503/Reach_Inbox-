import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { userRouter } from './user.routes.js';
import { senderRouter } from './sender.routes.js';
import { campaignRouter } from './campaign.routes.js';
import { emailJobRouter } from './emailJob.routes.js';
import { authRouter } from './auth.routes.js';
import { internalRouter } from './internal.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/senders', senderRouter);
apiRouter.use('/campaigns', campaignRouter);
apiRouter.use('/email-jobs', emailJobRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/internal', internalRouter);
