import { emailQueue } from './email.queue.js';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../config/logger.js';

function getExecutionJobId(emailJobId: string, scheduleVersion: number): string {
  return scheduleVersion === 1 ? `email-${emailJobId}` : `email-${emailJobId}-v${scheduleVersion}`;
}

export const emailSchedulerService = {
  async scheduleEmailJob(emailJobId: string) {
    try {
      const emailJob = await prisma.emailJob.findUnique({
        where: { id: emailJobId },
      });

      if (!emailJob) {
        throw ApiError.notFound('Email job not found');
      }

      if (emailJob.status !== 'SCHEDULED') {
        return { success: false, reason: 'Job is not in SCHEDULED status', status: emailJob.status };
      }

      const delay = Math.max(0, new Date(emailJob.scheduledAt).getTime() - Date.now());
      const jobId = getExecutionJobId(emailJob.id, emailJob.scheduleVersion);

      logger.info({ jobId, emailJobId, delay }, 'Scheduling single email job in BullMQ');

      await emailQueue.add(
        'send-email',
        {
          emailJobId: emailJob.id,
          campaignId: emailJob.campaignId,
          senderId: emailJob.senderId,
          scheduleVersion: emailJob.scheduleVersion,
        },
        {
          jobId,
          delay,
        },
      );

      await prisma.emailJob.update({
        where: { id: emailJob.id },
        data: { bullJobId: jobId },
      });

      return { success: true, jobId };
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      logger.error({ err: error, emailJobId }, 'Queue scheduling failed');
      throw ApiError.badRequest('Queue scheduling service is temporarily unavailable.', 'QUEUE_UNAVAILABLE');
    }
  },

  async scheduleEmailJobs(emailJobIds: string[]) {
    if (emailJobIds.length === 0) {
      return { scheduledCount: 0, failedCount: 0 };
    }

    try {
      const emailJobs = await prisma.emailJob.findMany({
        where: {
          id: { in: emailJobIds },
          status: 'SCHEDULED',
        },
      });

      if (emailJobs.length === 0) {
        return { scheduledCount: 0, failedCount: 0 };
      }

      logger.info({ count: emailJobs.length }, 'Bulk scheduling email jobs in BullMQ');

      const jobs = emailJobs.map((job) => {
        const delay = Math.max(0, new Date(job.scheduledAt).getTime() - Date.now());
        const jobId = getExecutionJobId(job.id, job.scheduleVersion);
        return {
          name: 'send-email',
          data: {
            emailJobId: job.id,
            campaignId: job.campaignId,
            senderId: job.senderId,
            scheduleVersion: job.scheduleVersion,
          },
          opts: {
            jobId,
            delay,
          },
        };
      });

      // Add to BullMQ in bulk
      await emailQueue.addBulk(jobs);

      // Batch update bullJobId in database
      const batchSize = env.BATCH_INSERT_SIZE;
      for (let i = 0; i < emailJobs.length; i += batchSize) {
        const chunk = emailJobs.slice(i, i + batchSize);
        await prisma.$transaction(
          chunk.map((job) =>
            prisma.emailJob.update({
              where: { id: job.id },
              data: { bullJobId: getExecutionJobId(job.id, job.scheduleVersion) },
            }),
          ),
        );
      }

      const scheduledCount = emailJobs.length;
      const failedCount = emailJobIds.length - scheduledCount;

      return { scheduledCount, failedCount };
    } catch (error) {
      logger.error({ err: error, emailJobIds }, 'Bulk queue scheduling failed');
      throw ApiError.badRequest('Queue scheduling service is temporarily unavailable.', 'QUEUE_UNAVAILABLE');
    }
  },

  async scheduleCampaign(campaignId: string) {
    const emailJobs = await prisma.emailJob.findMany({
      where: {
        campaignId,
        status: 'SCHEDULED',
      },
      select: { id: true },
    });

    const ids = emailJobs.map((j) => j.id);
    return this.scheduleEmailJobs(ids);
  },

  async ensureEmailJobScheduled(emailJobId: string) {
    try {
      const emailJob = await prisma.emailJob.findUnique({
        where: { id: emailJobId },
      });

      if (!emailJob) {
        throw ApiError.notFound('Email job not found');
      }

      if (emailJob.status !== 'SCHEDULED') {
        return { success: false, reason: 'Job is not in SCHEDULED status', status: emailJob.status };
      }

      const jobId = getExecutionJobId(emailJob.id, emailJob.scheduleVersion);
      const existingJob = await emailQueue.getJob(jobId);

      if (existingJob) {
        logger.info({ jobId, emailJobId }, 'Email job is already scheduled in BullMQ');
        
        // Sync database reference if missing
        if (!emailJob.bullJobId) {
          await prisma.emailJob.update({
            where: { id: emailJob.id },
            data: { bullJobId: jobId },
          });
        }
        
        return { success: true, jobId, alreadyExists: true };
      }

      // Re-schedule
      const delay = Math.max(0, new Date(emailJob.scheduledAt).getTime() - Date.now());
      logger.info({ jobId, emailJobId, delay }, 'Re-scheduling email job in BullMQ (reconciliation)');

      await emailQueue.add(
        'send-email',
        {
          emailJobId: emailJob.id,
          campaignId: emailJob.campaignId,
          senderId: emailJob.senderId,
          scheduleVersion: emailJob.scheduleVersion,
        },
        {
          jobId,
          delay,
        },
      );

      await prisma.emailJob.update({
        where: { id: emailJob.id },
        data: { bullJobId: jobId },
      });

      return { success: true, jobId, alreadyExists: false };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({ err: error, emailJobId }, 'Email job reconciliation failed');
      throw ApiError.badRequest('Queue scheduling service is temporarily unavailable.', 'QUEUE_UNAVAILABLE');
    }
  },
};
