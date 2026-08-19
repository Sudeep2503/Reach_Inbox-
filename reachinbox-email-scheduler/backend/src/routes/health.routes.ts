import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { emailQueue } from '../queues/email.queue.js';
import { sendSuccess } from '../utils/response.js';
import { prisma } from '../config/database.js';

export const healthRouter = Router();

healthRouter.get('/', asyncHandler(healthController.getHealth));

healthRouter.get(
  '/queue',
  asyncHandler(async (_req, res) => {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      emailQueue.getWaitingCount(),
      emailQueue.getActiveCount(),
      emailQueue.getCompletedCount(),
      emailQueue.getFailedCount(),
      emailQueue.getDelayedCount(),
    ]);

    const rateLimitedJobs = await prisma.emailJob.count({
      where: {
        status: 'SCHEDULED',
        rateLimitReschedules: { gt: 0 },
      },
    });

    sendSuccess(res, {
      queueName: emailQueue.name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      rateLimitedJobs,
    });
  }),
);
