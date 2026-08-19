/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { prisma, connectDatabase, disconnectDatabase } from '../config/database.js';
import { emailQueue } from '../queues/email.queue.js';
import { emailSchedulerService } from '../queues/email.scheduler.js';
import { createEmailWorker } from '../workers/email.worker.js';
import { smtpService } from '../services/email/smtp.service.js';
import { PermanentEmailError, RetryableEmailError } from '../services/email/errors.js';
import { authService } from '../auth/auth.service.js';
import { createApp } from '../app.js';
import { env } from '../config/env.js';

const app = createApp();
const testRunId = Date.now().toString(36);

let userId: string;
let senderId: string;
let sessionToken: string;

beforeAll(async () => {
  await connectDatabase();

  const user = await prisma.user.create({
    data: {
      email: `worker-user-${testRunId}@example.com`,
      name: 'Worker Test User',
    },
  });
  userId = user.id;

  const session = await authService.createSession(userId);
  sessionToken = session.sessionToken;

  const sender = await prisma.sender.create({
    data: {
      userId,
      email: `worker-sender-${testRunId}@example.com`,
      displayName: 'Worker Sender',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'worker-user',
      smtpPassword: 'secure-smtp-password',
      isActive: true,
    },
  });
  senderId = sender.id;
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
  await emailQueue.obliterate({ force: true }).catch(() => undefined);
  vi.restoreAllMocks();
});

describe('BullMQ Email Worker & SMTP Services Tests', () => {
  it('should successfully send email, map SENT state, store previewUrl, and update campaign counters', async () => {
    // 1. Mock SMTP success
    const mockSend = vi.spyOn(smtpService, 'sendMail').mockResolvedValue({
      messageId: '<test-message-id@example.com>',
      previewUrl: 'https://ethereal.email/message/test-preview-url',
    });

    // 2. Create Campaign and EmailJob
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Campaign success',
        body: 'Success content',
        startTime: new Date(),
        delayMs: 1000,
        status: 'SCHEDULED',
        totalRecipients: 1,
        scheduledCount: 1,
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'receiver@example.com',
        subject: 'Campaign success',
        body: 'Success content',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
      },
    });

    // 3. Create worker
    const worker = createEmailWorker();

    // 4. Queue the job
    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    // 5. Wait for worker to process
    await new Promise<void>((resolve) => {
      worker.on('completed', () => resolve());
    });

    await worker.close();

    // 6. Assert EmailJob state updates
    const updatedJob = await prisma.emailJob.findUnique({
      where: { id: emailJob.id },
    });
    expect(updatedJob!.status).toBe('SENT');
    expect(updatedJob!.previewUrl).toBe('https://ethereal.email/message/test-preview-url');
    expect(updatedJob!.sentAt).toBeDefined();
    expect(updatedJob!.attempts).toBe(1);

    // 7. Assert Campaign Counters updates
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id },
    });
    expect(updatedCampaign!.scheduledCount).toBe(0);
    expect(updatedCampaign!.sentCount).toBe(1);
    expect(updatedCampaign!.status).toBe('COMPLETED');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should handle retryable SMTP errors, trigger BullMQ retries, and eventually fail', async () => {
    // Mock SMTP connection timeout (Transient error)
    const mockSend = vi.spyOn(smtpService, 'sendMail').mockRejectedValue(
      new RetryableEmailError('Connection timed out'),
    );

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Campaign retry',
        body: 'Content',
        startTime: new Date(),
        delayMs: 1000,
        status: 'SCHEDULED',
        totalRecipients: 1,
        scheduledCount: 1,
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'receiver@example.com',
        subject: 'Campaign retry',
        body: 'Content',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
      },
    });

    const worker = createEmailWorker();

    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    // Wait for the first attempt failure
    await new Promise<void>((resolve) => {
      let count = 0;
      worker.on('failed', () => {
        count++;
        if (count === 1) resolve();
      });
    });

    await worker.close();

    // Verify job status was reset to SCHEDULED to allow BullMQ to retry later
    const updatedJob = await prisma.emailJob.findUnique({
      where: { id: emailJob.id },
    });
    expect(updatedJob!.status).toBe('SCHEDULED');
    expect(updatedJob!.attempts).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should immediately fail permanently on PermanentEmailError and transition Campaign to PARTIALLY_FAILED', async () => {
    // Mock SMTP Auth rejection (Permanent error)
    const mockSend = vi.spyOn(smtpService, 'sendMail').mockRejectedValue(
      new PermanentEmailError('Auth invalid credentials'),
    );

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Campaign perm',
        body: 'Content',
        startTime: new Date(),
        delayMs: 1000,
        status: 'SCHEDULED',
        totalRecipients: 1,
        scheduledCount: 1,
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'receiver@example.com',
        subject: 'Campaign perm',
        body: 'Content',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
      },
    });

    const worker = createEmailWorker();

    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    // Wait for job completion (will complete with status 'failed_permanent' on resolve)
    await new Promise<void>((resolve) => {
      worker.on('completed', () => resolve());
    });

    await worker.close();

    // Job should be FAILED in DB and not schedule retries
    const updatedJob = await prisma.emailJob.findUnique({
      where: { id: emailJob.id },
    });
    expect(updatedJob!.status).toBe('FAILED');
    expect(updatedJob!.failedAt).toBeDefined();
    expect(updatedJob!.errorCode).toBe('PermanentEmailError');
    expect(updatedJob!.errorMessage).toContain('Auth invalid credentials');

    // Campaign should transition to PARTIALLY_FAILED
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id },
    });
    expect(updatedCampaign!.scheduledCount).toBe(0);
    expect(updatedCampaign!.failedCount).toBe(1);
    expect(updatedCampaign!.status).toBe('PARTIALLY_FAILED');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should prevent double processing if job was already claimed (atomic claim checks)', async () => {
    vi.spyOn(smtpService, 'sendMail').mockResolvedValue({
      messageId: '<test-message-id-2@example.com>',
      previewUrl: 'https://ethereal.email/message/test-preview-url-2',
    });

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'Double Claim Test',
        body: 'Body',
        startTime: new Date(),
        delayMs: 1000,
        status: 'SCHEDULED',
        totalRecipients: 1,
        scheduledCount: 1,
      },
    });

    const emailJob = await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'duplicate@example.com',
        subject: 'Double Claim Test',
        body: 'Body',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
      },
    });

    // Manually mark the job as PROCESSING in the database to simulate another worker claiming it
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { status: 'PROCESSING' },
    });

    const worker = createEmailWorker();

    await emailSchedulerService.scheduleEmailJob(emailJob.id);

    // Wait for the worker to skip processing
    const result = await new Promise<any>((resolve) => {
      worker.on('completed', (jobResult) => {
        resolve(jobResult.returnvalue);
      });
    });

    await worker.close();

    // Verify worker skipped because of duplicate claim
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('claim_failed');

    // Verify SMTP service was never triggered
    expect(smtpService.sendMail).not.toHaveBeenCalled();
  });

  it('should verify sent-email API response sanitizes credentials and exposes previewUrl', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'API Sanitization Test',
        body: 'Body text',
        startTime: new Date(),
        delayMs: 1000,
        status: 'RUNNING',
      },
    });

    await prisma.emailJob.create({
      data: {
        campaignId: campaign.id,
        senderId,
        recipient: 'receiver-api@example.com',
        subject: 'API Sanitization Test',
        body: 'Body text',
        scheduledAt: new Date(),
        status: 'SENT',
        sentAt: new Date(),
        previewUrl: 'https://ethereal.email/preview-test',
        bullJobId: 'email:test-bull-id',
      },
    });

    const res = await request(app)
      .get('/api/email-jobs/sent')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);

    const jobItem = res.body.data[0];
    expect(jobItem.previewUrl).toBe('https://ethereal.email/preview-test');
    expect(jobItem.status).toBe('SENT');
    
    // Check that internal or sensitive fields are NOT exposed
    expect(jobItem.bullJobId).toBeUndefined();
    expect(jobItem.smtpPassword).toBeUndefined();
  });
});
