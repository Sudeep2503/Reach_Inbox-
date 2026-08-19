import { Worker } from 'bullmq';
import { redisConnectionConfig } from '../queues/connection.js';
import { emailQueue } from '../queues/email.queue.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import { emailService } from '../services/email/email.service.js';
import { PermanentEmailError } from '../services/email/errors.js';
import { rateLimitService } from '../services/rate-limit/rate-limit.service.js';
import type { CampaignStatus } from '@prisma/client';

export function createEmailWorker() {
  const worker = new Worker(
    env.BULLMQ_QUEUE_NAME,
    async (job) => {
      const { emailJobId } = job.data;
      logger.info({ jobId: job.id, emailJobId }, `BullMQ Job received: ${emailJobId}`);

      // 1. Load EmailJob from PostgreSQL
      const emailJob = await prisma.emailJob.findUnique({
        where: { id: emailJobId },
      });

      if (!emailJob) {
        logger.error({ jobId: job.id, emailJobId }, 'EmailJob not found in database. Permanent failure.');
        throw new PermanentEmailError('EmailJob not found in database');
      }

      // 2. Validate scheduleVersion to prevent stale executions
      const clientVersion = job.data.scheduleVersion ?? 1;
      if (clientVersion !== emailJob.scheduleVersion) {
        logger.warn({
          jobId: job.id,
          emailJobId,
          clientVersion,
          dbVersion: emailJob.scheduleVersion
        }, 'email.job.stale: Stale scheduling version execution detected. Skipping.');
        return { status: 'skipped', reason: 'stale_version', emailJobId };
      }

      // 3. Check if already processed
      if (emailJob.status === 'SENT' || emailJob.status === 'CANCELLED') {
        logger.warn({ jobId: job.id, emailJobId, status: emailJob.status }, 'EmailJob is already in terminal state. Skipping.');
        return { status: 'skipped', reason: 'already_terminal', emailJobId };
      }

      // 4. Atomically claim the job SCHEDULED -> PROCESSING
      // Also increments attempt counters in DB
      const claimResult = await prisma.emailJob.updateMany({
        where: {
          id: emailJobId,
          status: 'SCHEDULED',
          scheduleVersion: clientVersion, // ensure version hasn't changed since read
        },
        data: {
          status: 'PROCESSING',
        },
      });

      if (claimResult.count === 0) {
        logger.warn({ jobId: job.id, emailJobId }, 'EmailJob claim failed (already claimed or running). Skipping.');
        return { status: 'skipped', reason: 'claim_failed', emailJobId };
      }

      logger.info({ jobId: job.id, emailJobId }, 'EmailJob claimed successfully. Transitioned SCHEDULED -> PROCESSING');

      // 5. Update campaign status to RUNNING if it is currently SCHEDULED
      const campaign = await prisma.campaign.findUnique({
        where: { id: emailJob.campaignId },
      });

      if (campaign && campaign.status === 'SCHEDULED') {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'RUNNING' },
        });
        logger.info({ campaignId: campaign.id }, 'Campaign status transitioned SCHEDULED -> RUNNING');
      }

      // 6. Load and verify Sender
      const sender = await prisma.sender.findUnique({
        where: { id: emailJob.senderId },
      });

      if (!sender) {
        // Rollback processing claim attempts
        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: {
            status: 'SCHEDULED',
          },
        });
        throw new PermanentEmailError('Sender configuration not found in database');
      }

      if (!sender.isActive) {
        // Rollback processing claim attempts
        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: {
            status: 'SCHEDULED',
          },
        });
        throw new PermanentEmailError('Sender configuration is inactive');
      }

      // 7. Verify Distributed Rate Limiting Slots (fail closed if Redis is down)
      try {
        const hourlyRes = await rateLimitService.reserveHourlySlot(emailJob.senderId);
        logger.info({
          emailJobId,
          senderId: emailJob.senderId,
          remaining: hourlyRes.remaining,
          window: { start: hourlyRes.windowStart, end: hourlyRes.windowEnd },
        }, hourlyRes.allowed ? 'email.rate_limit.allowed' : 'email.rate_limit.denied');

        const delayRes = hourlyRes.allowed
          ? await rateLimitService.reserveMinimumDelaySlot(emailJob.senderId)
          : { allowed: false, retryAt: hourlyRes.retryAt };

        if (delayRes.allowed) {
          logger.info({ emailJobId, senderId: emailJob.senderId }, 'email.throttle.allowed');
        } else {
          logger.info({ emailJobId, senderId: emailJob.senderId, retryAt: delayRes.retryAt }, 'email.throttle.delayed');
        }

        if (!delayRes.allowed || !hourlyRes.allowed) {
          if (hourlyRes.allowed && !delayRes.allowed) {
            await rateLimitService.releaseHourlySlot(emailJob.senderId, hourlyRes.windowStart);
          }

          // Denied! We must reschedule.
          // Retry time is the maximum of the next available window slots
          const retryAt = new Date(Math.max(
            delayRes.retryAt?.getTime() ?? 0,
            hourlyRes.retryAt?.getTime() ?? 0
          ));

          const newVersion = emailJob.scheduleVersion + 1;

          // Revert job: PROCESSING -> SCHEDULED safely with version validation
          const revertResult = await prisma.emailJob.updateMany({
            where: {
              id: emailJobId,
              status: 'PROCESSING',
              scheduleVersion: clientVersion,
            },
            data: {
              status: 'SCHEDULED',
              scheduleVersion: newVersion,
              scheduledAt: retryAt,
              nextAttemptAt: retryAt,
              rateLimitReschedules: { increment: 1 },
              bullJobId: `email:${emailJobId}:v${newVersion}`,
            },
          });

          if (revertResult.count > 0) {
            logger.info({
              emailJobId,
              senderId: emailJob.senderId,
              retryAt,
              newVersion
            }, 'email.rate_limit.rescheduled');

            const delayMs = Math.max(0, retryAt.getTime() - Date.now()) + env.RATE_LIMIT_SAFETY_BUFFER_MS;

            try {
              await emailQueue.add(
                'email-job',
                {
                  emailJobId,
                  campaignId: emailJob.campaignId,
                  senderId: emailJob.senderId,
                  scheduleVersion: newVersion,
                },
                {
                  jobId: `email:${emailJobId}:v${newVersion}`,
                  delay: delayMs,
                  attempts: env.BULLMQ_JOB_ATTEMPTS,
                  backoff: {
                    type: 'exponential',
                    delay: env.BULLMQ_BACKOFF_DELAY,
                  },
                  removeOnComplete: env.QUEUE_REMOVE_ON_COMPLETE,
                  removeOnFail: env.QUEUE_REMOVE_ON_FAIL,
                }
              );
            } catch (queueError) {
              // Restore the current execution version so BullMQ can retry it.
              await prisma.emailJob.updateMany({
                where: {
                  id: emailJobId,
                  status: 'SCHEDULED',
                  scheduleVersion: newVersion,
                },
                data: {
                  scheduleVersion: clientVersion,
                  scheduledAt: emailJob.scheduledAt,
                  nextAttemptAt: null,
                  bullJobId: job.id?.toString() ?? null,
                },
              });
              throw queueError;
            }
          }

          return { status: 'rescheduled', emailJobId, retryAt };
        }
      } catch (redisError: unknown) {
        const err = redisError as Error;
        // Fail-closed block: revert claim and throw to retry through standard BullMQ retries
        logger.error({ err: err.message, emailJobId }, 'Rate limiter failed closed due to Redis infrastructure outage');
        await prisma.emailJob.updateMany({
          where: {
            id: emailJobId,
            status: 'PROCESSING',
            scheduleVersion: clientVersion,
          },
          data: {
            status: 'SCHEDULED',
          },
        });
        throw redisError;
      }

      // 8. Send the email via SMTP service
      try {
        // Attempts count real SMTP delivery attempts, never rate-limit deferrals.
        await prisma.emailJob.updateMany({
          where: {
            id: emailJobId,
            status: 'PROCESSING',
            scheduleVersion: clientVersion,
          },
          data: {
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });

        logger.info({ jobId: job.id, emailJobId, recipient: emailJob.recipient }, 'Sending email via SMTP service');
        const sendResult = await emailService.sendEmail({
          recipient: emailJob.recipient,
          subject: emailJob.subject,
          body: emailJob.body,
          sender: {
            email: sender.email,
            displayName: sender.displayName,
          },
        });

        // 9. On success: Mark SENT and update counters atomically
        await prisma.$transaction(async (tx) => {
          await tx.emailJob.update({
            where: { id: emailJobId },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              previewUrl: sendResult.previewUrl || null,
              lastAttemptAt: new Date(),
            },
          });

          const updatedCampaign = await tx.campaign.update({
            where: { id: emailJob.campaignId },
            data: {
              scheduledCount: { decrement: 1 },
              sentCount: { increment: 1 },
            },
          });

          const totalProcessed = updatedCampaign.sentCount + updatedCampaign.failedCount;
          let nextStatus: CampaignStatus = 'RUNNING';

          if (totalProcessed === updatedCampaign.totalRecipients) {
            nextStatus = updatedCampaign.failedCount > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED';
          }

          if (updatedCampaign.status !== nextStatus) {
            await tx.campaign.update({
              where: { id: emailJob.campaignId },
              data: { status: nextStatus },
            });
            logger.info({ campaignId: emailJob.campaignId, status: nextStatus }, 'Campaign transitioned status');
          }
        });

        logger.info({ jobId: job.id, emailJobId, previewUrl: sendResult.previewUrl }, 'Email sent successfully and state marked SENT');
        return { status: 'sent', emailJobId, previewUrl: sendResult.previewUrl };
      } catch (error: unknown) {
        const err = error as Error & { name?: string };
        logger.error({ err: err.message, jobId: job.id, emailJobId }, 'Worker encountered send failure');

        // Fetch updated attempts from DB
        const reloadedJob = await prisma.emailJob.findUnique({
          where: { id: emailJobId },
          select: { attempts: true },
        });
        const currentAttempts = reloadedJob?.attempts || 1;

        const isPermanent = error instanceof PermanentEmailError;
        const isRetryExhausted = currentAttempts >= env.BULLMQ_JOB_ATTEMPTS;

        if (isPermanent || isRetryExhausted) {
          // Terminal failure: Mark FAILED and update counters atomically
          const code = err.name || 'SEND_ERROR';
          const msg = err.message || 'Unknown send error';

          await prisma.$transaction(async (tx) => {
            await tx.emailJob.update({
              where: { id: emailJobId },
              data: {
                status: 'FAILED',
                failedAt: new Date(),
                errorCode: code,
                errorMessage: msg.substring(0, 1000), // Limit size in DB
                lastAttemptAt: new Date(),
              },
            });

            const updatedCampaign = await tx.campaign.update({
              where: { id: emailJob.campaignId },
              data: {
                scheduledCount: { decrement: 1 },
                failedCount: { increment: 1 },
              },
            });

            const totalProcessed = updatedCampaign.sentCount + updatedCampaign.failedCount;
            let nextStatus: CampaignStatus = 'RUNNING';

            if (totalProcessed === updatedCampaign.totalRecipients) {
              nextStatus = 'PARTIALLY_FAILED'; // because failedCount > 0
            }

            if (updatedCampaign.status !== nextStatus) {
              await tx.campaign.update({
                where: { id: emailJob.campaignId },
                data: { status: nextStatus },
              });
            }
          });

          logger.error({ jobId: job.id, emailJobId, isPermanent, isRetryExhausted }, 'Email job transitioned to terminal FAILED state');
          
          if (isPermanent) {
            return { status: 'failed_permanent', emailJobId, error: err.message };
          }
          throw err;
        } else {
          // Revert claim attempts back to SCHEDULED in DB
          await prisma.emailJob.update({
            where: { id: emailJobId },
            data: { status: 'SCHEDULED', nextAttemptAt: new Date(Date.now() + env.BULLMQ_BACKOFF_DELAY) },
          });

          logger.info({ jobId: job.id, emailJobId, currentAttempts }, 'Email job reset to SCHEDULED for next retry attempt');
          throw err;
        }
      }
    },
    {
      connection: redisConnectionConfig,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on('ready', () => {
    logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'BullMQ Worker started');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'BullMQ Job execution failed');
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'BullMQ Worker encountered an error');
  });

  return worker;
}
