/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { prisma, connectDatabase, disconnectDatabase } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';
import { rateLimitService, RedisUnavailableError } from '../services/rate-limit/rate-limit.service.js';
import { smtpService } from '../services/email/smtp.service.js';
import { emailQueue } from '../queues/email.queue.js';
import { emailSchedulerService } from '../queues/email.scheduler.js';
import { createEmailWorker } from '../workers/email.worker.js';
import { env } from '../config/env.js';
import { authService } from '../auth/auth.service.js';
import { createApp } from '../app.js';

const app = createApp();
const testRunId = Date.now().toString(36);

let userId: string;
let senderAId: string;
let senderBId: string;
let sessionToken: string;

beforeAll(async () => {
  await connectDatabase();

  const user = await prisma.user.create({
    data: {
      email: `ratelimit-user-${testRunId}@example.com`,
      name: 'Rate Limit User',
    },
  });
  userId = user.id;

  const session = await authService.createSession(userId);
  sessionToken = session.sessionToken;

  const senderA = await prisma.sender.create({
    data: {
      userId,
      email: `ratelimit-sender-a-${testRunId}@example.com`,
      displayName: 'Sender A',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender-a',
      smtpPassword: 'secure-password',
      isActive: true,
    },
  });
  senderAId = senderA.id;

  const senderB = await prisma.sender.create({
    data: {
      userId,
      email: `ratelimit-sender-b-${testRunId}@example.com`,
      displayName: 'Sender B',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender-b',
      smtpPassword: 'secure-password',
      isActive: true,
    },
  });
  senderBId = senderB.id;
});

afterAll(async () => {
  await emailQueue.obliterate({ force: true }).catch(() => undefined);
  await emailQueue.close();

  await prisma.emailJob.deleteMany({ where: { campaign: { userId } } }).catch(() => undefined);
  await prisma.campaign.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.sender.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.session.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);

  await disconnectDatabase();
});

beforeEach(async () => {
  const client = getRedisClient();
  if (client.status === 'ready') {
    // Clear all prefix keys in Redis to ensure clean starting states
    const keys = await client.keys('reachinbox:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
  vi.restoreAllMocks();
});

describe('Distributed Rate Limiting & Throttling Integration Tests', () => {
  it('should allow hourly sends below sender hourly limit and deny at limit', async () => {
    // Temporarily override limit to 3 to verify
    const originalLimit = env.MAX_EMAILS_PER_HOUR_PER_SENDER;
    (env as any).MAX_EMAILS_PER_HOUR_PER_SENDER = 3;

    // Slot 1
    const res1 = await rateLimitService.reserveHourlySlot(senderAId);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    // Slot 2
    const res2 = await rateLimitService.reserveHourlySlot(senderAId);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    // Slot 3
    const res3 = await rateLimitService.reserveHourlySlot(senderAId);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    // Slot 4 - Denied
    const res4 = await rateLimitService.reserveHourlySlot(senderAId);
    expect(res4.allowed).toBe(false);
    expect(res4.retryAt).toBeDefined();

    // Revert override
    (env as any).MAX_EMAILS_PER_HOUR_PER_SENDER = originalLimit;
  });

  it('should enforce per-sender isolation (Sender A exhaustion does not block Sender B)', async () => {
    const originalLimit = env.MAX_EMAILS_PER_HOUR_PER_SENDER;
    (env as any).MAX_EMAILS_PER_HOUR_PER_SENDER = 2;

    // Expose Sender A
    await rateLimitService.reserveHourlySlot(senderAId);
    await rateLimitService.reserveHourlySlot(senderAId);
    const resA = await rateLimitService.reserveHourlySlot(senderAId);
    expect(resA.allowed).toBe(false); // Denied

    // Sender B should operate independently and be allowed
    const resB = await rateLimitService.reserveHourlySlot(senderBId);
    expect(resB.allowed).toBe(true);

    (env as any).MAX_EMAILS_PER_HOUR_PER_SENDER = originalLimit;
  });

  it('should enforce atomic minimum delay between consecutive send reservations', async () => {
    const originalDelay = env.MIN_DELAY_BETWEEN_EMAILS;
    (env as any).MIN_DELAY_BETWEEN_EMAILS = 1000;

    // Reservation 1
    const res1 = await rateLimitService.reserveMinimumDelaySlot(senderAId);
    expect(res1.allowed).toBe(true);

    // Immediate reservation 2 - Denied due to minimum delay spacing
    const res2 = await rateLimitService.reserveMinimumDelaySlot(senderAId);
    expect(res2.allowed).toBe(false);
    expect(res2.waitMs).toBeGreaterThan(0);

    (env as any).MIN_DELAY_BETWEEN_EMAILS = originalDelay;
  });

  it('should atomically revert to SCHEDULED, increment reschedules, and create delayed BullMQ job when throttled', async () => {
    // 1. Mock SMTP success but rate limit as DENIED
    vi.spyOn(smtpService, 'sendMail').mockResolvedValue({
      messageId: '<msg-id@example.com>',
      previewUrl: 'https://ethereal.email/msg',
    });

    vi.spyOn(rateLimitService, 'reserveHourlySlot').mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 2,
      windowStart: new Date(),
      windowEnd: new Date(),
      retryAt: new Date(Date.now() + 5000), // Next hour boundary simulation
    });

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Throttled Campaign',
        body: 'Body text',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
        totalRecipients: 1,
        scheduledCount: 1,
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId: senderAId,
        recipient: 'receiver@example.com',
        subject: 'Throttled Campaign',
        body: 'Body text',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
        scheduleVersion: 1,
      },
    });

    const worker = createEmailWorker();

    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    // Wait for the worker to process the job (will return rescheduled status)
    const result = await new Promise<any>((resolve) => {
      worker.on('completed', (jobResult) => {
        resolve(jobResult.returnvalue);
      });
    });

    await worker.close();

    // Verify it was rescheduled instead of sent
    expect(result.status).toBe('rescheduled');

    const updatedJob = await prisma.emailJob.findUnique({
      where: { id: emailJob.id },
    });
    expect(updatedJob!.status).toBe('SCHEDULED');
    expect(updatedJob!.scheduleVersion).toBe(2);
    expect(updatedJob!.rateLimitReschedules).toBe(1);
    expect(updatedJob!.attempts).toBe(0); // attempts does NOT increment for rate limit defers!

    // Verify campaign counters remain unchanged
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id },
    });
    expect(updatedCampaign!.sentCount).toBe(0);
    expect(updatedCampaign!.scheduledCount).toBe(1);
  });

  it('should ignore and skip obsolete executions with stale scheduleVersion matching', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Stale Version Test',
        body: 'Body text',
        startTime: new Date(),
        delayMs: 2000,
        status: 'RUNNING',
      },
    });

    // Create a job in database with version = 2
    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId: senderAId,
        recipient: 'receiver@example.com',
        subject: 'Stale Version Test',
        body: 'Body text',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
        scheduleVersion: 2,
      },
    });

    const worker = createEmailWorker();

    // Queue a job payload representing stale version 1
    await emailQueue.add(
      'email-job',
      {
        emailJobId: emailJob.id,
        campaignId: campaign.id,
        senderId: senderAId,
        scheduleVersion: 1, // Stale!
      },
      {
        jobId: `email:${emailJob.id}:v1`,
      }
    );

    // Wait for worker to complete
    const result = await new Promise<any>((resolve) => {
      worker.on('completed', (jobResult) => {
        resolve(jobResult.returnvalue);
      });
    });

    await worker.close();

    // Verify it skipped processing cleanly
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('stale_version');

    // Verify database remains untouched
    const dbJob = await prisma.emailJob.findUnique({
      where: { id: emailJob.id },
    });
    expect(dbJob!.status).toBe('SCHEDULED');
    expect(dbJob!.scheduleVersion).toBe(2);
  });

  it('should fail closed when Redis rate limiter is unavailable', async () => {
    // Mock reserveMinimumDelaySlot to throw Redis connection error
    vi.spyOn(rateLimitService, 'reserveMinimumDelaySlot').mockRejectedValue(
      new RedisUnavailableError('Redis connection down'),
    );

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Fail Closed Campaign',
        body: 'Body text',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
        totalRecipients: 1,
        scheduledCount: 1,
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId: senderAId,
        recipient: 'failclosed@example.com',
        subject: 'Fail Closed Campaign',
        body: 'Body text',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
        scheduleVersion: 1,
      },
    });

    const worker = createEmailWorker();

    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    // Wait for the worker to fail (transient retry)
    await new Promise<void>((resolve) => {
      worker.on('failed', () => resolve());
    });

    await worker.close();

    // Verify the job was safely reset back to SCHEDULED in DB
    const dbJob = await prisma.emailJob.findUnique({
      where: { id: emailJob.id },
    });
    expect(dbJob!.status).toBe('SCHEDULED');
    expect(dbJob!.attempts).toBe(0); // attempt count reverted
  });

  it('should verify GET /api/senders/:id/rate-limit endpoint return status metrics', async () => {
    const res = await request(app)
      .get(`/api/senders/${senderAId}/rate-limit`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.limit).toBeDefined();
    expect(res.body.data.used).toBeDefined();
    expect(res.body.data.remaining).toBeDefined();
    expect(res.body.data.windowStart).toBeDefined();
    expect(res.body.data.windowEnd).toBeDefined();
  });
});
