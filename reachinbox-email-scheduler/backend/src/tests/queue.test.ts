import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma, connectDatabase, disconnectDatabase } from '../config/database.js';
import { emailQueue } from '../queues/email.queue.js';
import { emailSchedulerService } from '../queues/email.scheduler.js';
import { createEmailWorker } from '../workers/email.worker.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testRunId = Date.now().toString(36);

let userId: string;
let senderId: string;

beforeAll(async () => {
  await connectDatabase();

  const user = await prisma.user.create({
    data: {
      email: `queue-user-${testRunId}@example.com`,
      name: 'Queue Test User',
    },
  });
  userId = user.id;

  const sender = await prisma.sender.create({
    data: {
      userId,
      email: `queue-sender-${testRunId}@example.com`,
      displayName: 'Queue Sender',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'queue-user',
      smtpPassword: 'secure-smtp-password-xyz',
      isActive: true,
    },
  });
  senderId = sender.id;
});

afterAll(async () => {
  // Wipe test queue from Redis
  await emailQueue.obliterate({ force: true }).catch(() => undefined);
  await emailQueue.close();

  // Cleanup database
  await prisma.emailJob.deleteMany({ where: { campaign: { userId } } }).catch(() => undefined);
  await prisma.campaign.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.sender.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);

  await disconnectDatabase();
});

beforeEach(async () => {
  // Clear jobs from Redis queue before each test
  await emailQueue.obliterate({ force: true }).catch(() => undefined);
});

describe('BullMQ Queue & Worker Architecture Tests', () => {
  it('should initialize emailQueue successfully', () => {
    expect(emailQueue).toBeDefined();
    expect(emailQueue.name).toBe(env.BULLMQ_QUEUE_NAME);
  });

  it('should map EmailJob to deterministic BullMQ job ID', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Deterministic Test',
        body: 'Test Body',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'test@example.com',
        subject: 'Deterministic Test',
        body: 'Test Body',
        scheduledAt: new Date(Date.now() + 10000),
      },
    });

    const expectedJobId = `email-${emailJob.id}`;
    const result = await emailSchedulerService.scheduleEmailJob(emailJob.id);

    expect(result.success).toBe(true);
    expect(result.jobId).toBe(expectedJobId);

    // Verify job exists in BullMQ under that exact jobId
    const bullJob = await emailQueue.getJob(expectedJobId);
    expect(bullJob).toBeDefined();
    expect(bullJob!.id).toBe(expectedJobId);
  });

  it('should calculate delay correctly for future job', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Future Test',
        body: 'Body',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const tenSecsFuture = new Date(Date.now() + 10000);
    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'future@example.com',
        subject: 'Future Test',
        body: 'Body',
        scheduledAt: tenSecsFuture,
      },
    });

    const jobId = `email-${emailJob.id}`;
    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    const bullJob = await emailQueue.getJob(jobId);
    expect(bullJob).toBeDefined();
    expect(bullJob!.delay).toBeGreaterThan(8000);
    expect(bullJob!.delay).toBeLessThanOrEqual(10000);
  });

  it('should calculate delay = 0 for past jobs (immediate dispatch)', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Past Test',
        body: 'Body',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const tenSecsPast = new Date(Date.now() - 10000);
    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'past@example.com',
        subject: 'Past Test',
        body: 'Body',
        scheduledAt: tenSecsPast,
      },
    });

    const jobId = `email-${emailJob.id}`;
    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    const bullJob = await emailQueue.getJob(jobId);
    expect(bullJob).toBeDefined();
    expect(bullJob!.delay).toBe(0);
  });

  it('should enforce enqueuing idempotency (cannot schedule twice)', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Idempotency Test',
        body: 'Body',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'idempotent@example.com',
        subject: 'Idempotency Test',
        body: 'Body',
        scheduledAt: new Date(Date.now() + 5000),
      },
    });

    // Schedule 1st time
    const res1 = await emailSchedulerService.ensureEmailJobScheduled(emailJob.id);
    expect(res1.alreadyExists).toBe(false);

    // Schedule 2nd time
    const res2 = await emailSchedulerService.ensureEmailJobScheduled(emailJob.id);
    expect(res2.alreadyExists).toBe(true);

    // Verify only ONE BullMQ job exists in the queue
    const count = await emailQueue.getDelayedCount();
    expect(count).toBe(1);
  });

  it('should store only minimal payload and exclude SMTP password in job data', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Payload Test',
        body: 'Body content containing sensitive info',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'payload@example.com',
        subject: 'Payload Test',
        body: 'Body content containing sensitive info',
        scheduledAt: new Date(Date.now() + 5000),
      },
    });

    const jobId = `email-${emailJob.id}`;
    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    const bullJob = await emailQueue.getJob(jobId);
    expect(bullJob).toBeDefined();
    
    // Check that we only pass ID reference pointers
    expect(bullJob!.data).toEqual({
      emailJobId: emailJob.id,
      campaignId: campaign.id,
      senderId,
      scheduleVersion: 1,
    });

    // Verify sensitive keys are NOT leaked to Redis
    const dataStr = JSON.stringify(bullJob!.data);
    expect(dataStr).not.toContain('secure-smtp-password-xyz');
    expect(dataStr).not.toContain('sensitive info');
  });

  it('should support enqueuing 1000 jobs in bulk efficiently', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Bulk Test',
        body: 'Body',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const jobsData = Array.from({ length: 1000 }).map((_, i) => ({
      campaignId: campaign.id,
      senderId,
      recipient: `bulk-${i}@example.com`,
      subject: 'Bulk Test',
      body: 'Body',
      scheduledAt: new Date(Date.now() + 60000),
    }));

    await prisma.emailJob.createMany({
      data: jobsData,
    });

    const dbJobs = await prisma.emailJob.findMany({
      where: { campaignId: campaign.id },
      select: { id: true },
    });
    const ids = dbJobs.map((j) => j.id);

    expect(ids.length).toBe(1000);

    const scheduleRes = await emailSchedulerService.scheduleEmailJobs(ids);
    expect(scheduleRes.scheduledCount).toBe(1000);

    const delayedCount = await emailQueue.getDelayedCount();
    expect(delayedCount).toBe(1000);
  });

  it('should preserve delayed jobs in Redis across API restarts', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Restart Test',
        body: 'Body',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'restart@example.com',
        subject: 'Restart Test',
        body: 'Body',
        scheduledAt: new Date(Date.now() + 30000),
      },
    });

    const jobId = `email-${emailJob.id}`;
    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    // Simulate stopping the API connection (closing the queue handler)
    await emailQueue.close();

    // Re-instantiate queue connection (simulating start)
    const newQueue = new (await import('bullmq')).Queue(env.BULLMQ_QUEUE_NAME, {
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
    });

    const bullJob = await newQueue.getJob(jobId);
    expect(bullJob).toBeDefined();
    expect(bullJob!.id).toBe(jobId);

    await newQueue.close();
  });

  it('should recreate missing jobs during reconciliation', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Reconcile Test',
        body: 'Body',
        startTime: new Date(),
        delayMs: 2000,
        status: 'SCHEDULED',
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'reconcile@example.com',
        subject: 'Reconcile Test',
        body: 'Body',
        scheduledAt: new Date(Date.now() + 10000),
      },
    });

    const jobId = `email-${emailJob.id}`;

    // Reconciliation 1: Adds job because it doesn't exist
    const res1 = await emailSchedulerService.ensureEmailJobScheduled(emailJob.id);
    expect(res1.alreadyExists).toBe(false);

    // Deliberately delete job from Redis
    const bullJob = await emailQueue.getJob(jobId);
    await bullJob?.remove();

    const checkRemoved = await emailQueue.getJob(jobId);
    expect(checkRemoved).toBeUndefined();

    // Reconciliation 2: Recreates missing job
    const res2 = await emailSchedulerService.ensureEmailJobScheduled(emailJob.id);
    expect(res2.alreadyExists).toBe(false);

    const checkRecreated = await emailQueue.getJob(jobId);
    expect(checkRecreated).toBeDefined();
  });

  it('should verify worker concurrency reads configuration', () => {
    const worker = createEmailWorker();
    expect(worker.opts.concurrency).toBe(env.WORKER_CONCURRENCY);
    void worker.close();
  });

  it('should confirm that no cron/scheduler packages are declared in package.json', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(allDeps['node-cron']).toBeUndefined();
    expect(allDeps['cron']).toBeUndefined();
    expect(allDeps['agenda']).toBeUndefined();
  });
});
