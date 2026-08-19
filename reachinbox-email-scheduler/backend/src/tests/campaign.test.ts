/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../config/database.js';
import { authService } from '../auth/auth.service.js';
import { campaignService } from '../services/campaign.service.js';
import { env } from '../config/env.js';

const app = createApp();
const testRunId = Date.now().toString(36);

let userIdA: string;
let userIdB: string;
let sessionTokenA: string;
let sessionTokenB: string;

let senderAId: string;
let senderBId: string;

import { emailSchedulerService } from '../queues/email.scheduler.js';

beforeAll(async () => {
  await connectDatabase();

  // Mock scheduler to avoid Redis connection blocks in campaign tests
  vi.spyOn(emailSchedulerService, 'scheduleCampaign').mockResolvedValue({
    scheduledCount: 1,
    failedCount: 0,
  });
  vi.spyOn(emailSchedulerService, 'scheduleEmailJob').mockResolvedValue({
    success: true,
    jobId: 'email:mock-id',
  });
  vi.spyOn(emailSchedulerService, 'scheduleEmailJobs').mockResolvedValue({
    scheduledCount: 1,
    failedCount: 0,
  });

  // Create two users
  const userA = await prisma.user.create({
    data: {
      email: `campaign-a-${testRunId}@example.com`,
      name: 'Campaign User A',
    },
  });
  userIdA = userA.id;

  const userB = await prisma.user.create({
    data: {
      email: `campaign-b-${testRunId}@example.com`,
      name: 'Campaign User B',
    },
  });
  userIdB = userB.id;

  // Create session cookies
  const sessionA = await authService.createSession(userIdA);
  sessionTokenA = sessionA.sessionToken;

  const sessionB = await authService.createSession(userIdB);
  sessionTokenB = sessionB.sessionToken;

  // Create a sender for each user
  const senderA = await prisma.sender.create({
    data: {
      userId: userIdA,
      email: `sender-a-${testRunId}@example.com`,
      displayName: 'Sender A',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender-a',
      smtpPassword: 'password-a',
      isActive: true,
    },
  });
  senderAId = senderA.id;

  const senderB = await prisma.sender.create({
    data: {
      userId: userIdB,
      email: `sender-b-${testRunId}@example.com`,
      displayName: 'Sender B',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender-b',
      smtpPassword: 'password-b',
      isActive: true,
    },
  });
  senderBId = senderB.id;
});

afterAll(async () => {
  // Cleanup database
  await prisma.session.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } }).catch(() => undefined);
  await prisma.emailJob.deleteMany({ where: { campaign: { userId: { in: [userIdA, userIdB] } } } }).catch(() => undefined);
  await prisma.campaign.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } }).catch(() => undefined);
  await prisma.sender.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [userIdA, userIdB] } } }).catch(() => undefined);

  await disconnectDatabase();
});

describe('POST /api/campaigns - Authentication', () => {
  it('should block unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .field('subject', 'Test')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', new Date(Date.now() + 3600000).toISOString())
      .field('delayMs', '2000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from('email\nuser@example.com'), 'leads.csv');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/campaigns - Payload Validations', () => {
  const getFutureTime = (hours = 1) => new Date(Date.now() + hours * 3600000).toISOString();
  const getPastTime = () => new Date(Date.now() - 3600000).toISOString();

  it('should reject invalid subject (empty)', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', '')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '2000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from('email\nuser@example.com'), 'leads.csv');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject past start times', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Future Subject')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', getPastTime())
      .field('delayMs', '2000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from('email\nuser@example.com'), 'leads.csv');

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toContain('future');
  });

  it('should reject invalid negative delays', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Valid subject')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '-100')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from('email\nuser@example.com'), 'leads.csv');

    expect(res.status).toBe(400);
  });

  it('should reject invalid zero or negative hourly limits', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Valid subject')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '1000')
      .field('hourlyLimit', '0')
      .attach('file', Buffer.from('email\nuser@example.com'), 'leads.csv');

    expect(res.status).toBe(400);
  });

  it('should reject missing leads file', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Valid subject')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '1000')
      .field('hourlyLimit', '200');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FILE');
  });

  it('should reject empty leads file', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Valid subject')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '1000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from('   '), 'leads.csv');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_FILE');
  });

  it('should reject unsupported file extensions', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Valid subject')
      .field('body', 'Test body')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '1000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from('email\nuser@example.com'), 'leads.exe');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it("should prevent User A from using User B's sender (return 404)", async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Campaign A')
      .field('body', 'Body A')
      .field('senderId', senderBId) // Sender B belongs to User B!
      .field('startTime', getFutureTime())
      .field('delayMs', '2000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from('email\nuser@example.com'), 'leads.csv');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/campaigns - Parsing and Duplicates', () => {
  const getFutureTime = () => new Date(Date.now() + 3600000).toISOString();

  it('should process CSV with header and remove duplicates and invalid emails', async () => {
    const csvContent = `name,email
John,john@example.com
Jane,JANE@EXAMPLE.COM
Duplicate,john@example.com
Invalid,not-an-email-address
Bob,bob@example.com`;

    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'CSV Campaign')
      .field('body', 'Body content')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '2000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from(csvContent), 'leads.csv');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recipients.totalRowsProcessed).toBe(5);
    expect(res.body.data.recipients.validEmails).toBe(3); // john, jane, bob
    expect(res.body.data.recipients.invalidEmails).toBe(1); // not-an-email-address
    expect(res.body.data.recipients.duplicateEmails).toBe(1); // john@example.com duplicate

    // Check campaign details
    expect(res.body.data.campaign.totalRecipients).toBe(3);
    expect(res.body.data.campaign.scheduledCount).toBe(3);
    expect(res.body.data.campaign.status).toBe('SCHEDULED');
  });

  it('should process TXT with various separators', async () => {
    const txtContent = `john@example.com
JANE@EXAMPLE.COM
john@example.com
not-an-email-address
alice@example.com;bob@example.com`;

    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'TXT Campaign')
      .field('body', 'Body content')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '2000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from(txtContent), 'leads.txt');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recipients.validEmails).toBe(4); // john, jane, alice, bob
  });

  it('should fail campaign creation if zero valid unique emails remain', async () => {
    const csvContent = `name,email
Invalid,not-an-email-address`;

    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'No Recipients')
      .field('body', 'Body content')
      .field('senderId', senderAId)
      .field('startTime', getFutureTime())
      .field('delayMs', '2000')
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from(csvContent), 'leads.csv');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_VALID_RECIPIENTS');
  });
});

describe('Campaign Transaction, Rollback, and Time Calculations', () => {
  const getFutureTime = () => new Date(Date.now() + 3600000).toISOString();

  it('should roll back campaign creation if email jobs fails to insert', async () => {
    const csvFile = {
      buffer: Buffer.from('email\nrollback-user@example.com'),
      originalname: 'leads.csv',
    };

    const payload = {
      subject: 'Rollback Campaign',
      body: 'Rollback Body',
      senderId: senderAId,
      startTime: getFutureTime(),
      delayMs: 2000,
      hourlyLimit: 200,
    };

    // Intercept transaction client to simulate failure on tx.emailJob.createMany
    const originalTransaction = prisma.$transaction;
    const mockSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return originalTransaction.call(prisma, async (tx) => {
        vi.spyOn(tx.emailJob, 'createMany').mockRejectedValueOnce(new Error('DB creation error'));
        return callback(tx);
      });
    });

    await expect(campaignService.createCampaign(userIdA, payload, csvFile)).rejects.toThrow('DB creation error');

    // Confirm campaign was rolled back and is not in DB
    const campaignCount = await prisma.campaign.count({
      where: {
        subject: 'Rollback Campaign',
        userId: userIdA,
      },
    });

    expect(campaignCount).toBe(0);
    mockSpy.mockRestore();
    // Force writeback original implementation
    prisma.$transaction = originalTransaction;
  });

  it('should calculate individual scheduled times correctly', async () => {
    const csvContent = 'email\na@example.com\nb@example.com\nc@example.com';
    const startTimeISO = '2027-08-20T10:00:00.000Z'; // UTC timezone

    const res = await request(app)
      .post('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`])
      .field('subject', 'Time Calculation Campaign')
      .field('body', 'Body content')
      .field('senderId', senderAId)
      .field('startTime', startTimeISO)
      .field('delayMs', '2000') // 2 seconds
      .field('hourlyLimit', '200')
      .attach('file', Buffer.from(csvContent), 'leads.csv');

    expect(res.status).toBe(201);
    const campaignId = res.body.data.campaign.id;

    // Fetch created email jobs and assert timestamps
    const emailJobs = await prisma.emailJob.findMany({
      where: { campaignId },
      orderBy: { scheduledAt: 'asc' },
    });

    expect(emailJobs.length).toBe(3);
    // index 0: +0s
    expect(emailJobs[0]!.scheduledAt.toISOString()).toBe('2027-08-20T10:00:00.000Z');
    // index 1: +2s
    expect(emailJobs[1]!.scheduledAt.toISOString()).toBe('2027-08-20T10:00:02.000Z');
    // index 2: +4s
    expect(emailJobs[2]!.scheduledAt.toISOString()).toBe('2027-08-20T10:00:04.000Z');
  });
});

describe('GET /api/campaigns - Ownership & Filtering', () => {
  it("should restrict listing to authenticated user's campaigns", async () => {
    // User A lists campaigns
    const resA = await request(app)
      .get('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`]);

    expect(resA.status).toBe(200);
    // User B lists campaigns
    const resB = await request(app)
      .get('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenB}`]);

    expect(resB.status).toBe(200);
    expect(resB.body.data.length).toBe(0); // User B has no campaigns yet
  });
});
