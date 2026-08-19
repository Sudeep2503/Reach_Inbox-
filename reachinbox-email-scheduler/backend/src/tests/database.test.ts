import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma, connectDatabase, disconnectDatabase } from '../config/database.js';
import { campaignRepository } from '../repositories/campaign.repository.js';
import { emailJobRepository } from '../repositories/emailJob.repository.js';
import { senderRepository } from '../repositories/sender.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { createCampaignWithEmailJobs } from '../services/campaignTransaction.service.js';

const testRunId = Date.now().toString(36);
const testEmail = `test-${testRunId}@example.com`;

let userId: string;
let senderId: string;
let campaignId: string;
let emailJobId: string;

beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  if (emailJobId) {
    await prisma.emailJob.deleteMany({ where: { campaignId } }).catch(() => undefined);
  }
  if (campaignId) {
    await prisma.campaign.deleteMany({ where: { id: campaignId } }).catch(() => undefined);
  }
  if (senderId) {
    await prisma.sender.deleteMany({ where: { id: senderId } }).catch(() => undefined);
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
  }

  await disconnectDatabase();
});

describe('Database connectivity', () => {
  it('connects to PostgreSQL', async () => {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(result[0]?.ok).toBe(1);
  });
});

describe('User repository', () => {
  it('creates a user', async () => {
    const user = await userRepository.create({
      email: testEmail,
      name: 'Test User',
    });

    userId = user.id;

    expect(user.email).toBe(testEmail);
    expect(user.name).toBe('Test User');
  });

  it('enforces unique email constraint', async () => {
    await expect(
      userRepository.create({
        email: testEmail,
        name: 'Duplicate User',
      }),
    ).rejects.toThrow();
  });
});

describe('Sender repository', () => {
  it('creates a sender belonging to a user without returning smtpPassword', async () => {
    const sender = await senderRepository.create({
      user: { connect: { id: userId } },
      email: `sender-${testRunId}@example.com`,
      displayName: 'Test Sender',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender@example.com',
      smtpPassword: 'super-secret-password',
    });

    senderId = sender.id;

    expect(sender.userId).toBe(userId);
    expect(sender).not.toHaveProperty('smtpPassword');
  });

  it('enforces unique sender email per user', async () => {
    await expect(
      senderRepository.create({
        user: { connect: { id: userId } },
        email: `sender-${testRunId}@example.com`,
        displayName: 'Duplicate Sender',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'sender@example.com',
        smtpPassword: 'another-secret',
      }),
    ).rejects.toThrow();
  });
});

describe('Campaign repository', () => {
  it('creates a campaign belonging to a user', async () => {
    const campaign = await campaignRepository.create({
      user: { connect: { id: userId } },
      subject: 'Test Campaign',
      body: 'Hello from tests',
      startTime: new Date(),
      delayMs: 1000,
    });

    campaignId = campaign.id;

    expect(campaign.userId).toBe(userId);
    expect(campaign.status).toBe('DRAFT');
    expect(campaign.totalRecipients).toBe(0);
  });
});

describe('EmailJob repository', () => {
  it('creates an email job linked to campaign and sender', async () => {
    const job = await emailJobRepository.create({
      campaign: { connect: { id: campaignId } },
      sender: { connect: { id: senderId } },
      recipient: `recipient-${testRunId}@example.com`,
      subject: 'Test Campaign',
      body: 'Hello from tests',
      scheduledAt: new Date(),
    });

    emailJobId = job.id;

    expect(job.campaignId).toBe(campaignId);
    expect(job.senderId).toBe(senderId);
    expect(job.status).toBe('SCHEDULED');
  });

  it('atomically claims a scheduled job for processing', async () => {
    const claimed = await emailJobRepository.claimForProcessing(emailJobId);

    expect(claimed).toBe(true);

    const job = await emailJobRepository.findById(emailJobId);
    expect(job?.status).toBe('PROCESSING');
    expect(job?.attempts).toBe(1);
  });

  it('does not claim a job that is already processing', async () => {
    const claimedAgain = await emailJobRepository.claimForProcessing(emailJobId);

    expect(claimedAgain).toBe(false);
  });
});

describe('Campaign transaction service', () => {
  it('creates a campaign and email jobs atomically', async () => {
    const result = await createCampaignWithEmailJobs({
      userId,
      subject: 'Transactional Campaign',
      body: 'Atomic creation test',
      startTime: new Date(),
      delayMs: 500,
      senderId,
      recipients: [`tx-${testRunId}-1@example.com`, `tx-${testRunId}-2@example.com`],
    });

    expect(result.campaign.totalRecipients).toBe(2);
    expect(result.emailJobs).toHaveLength(2);

    await prisma.emailJob.deleteMany({ where: { campaignId: result.campaign.id } });
    await prisma.campaign.delete({ where: { id: result.campaign.id } });
  });
});

describe('EmailJob idempotency preparation', () => {
  it('supports unique bullJobId when provided', async () => {
    const bullJobId = `bull-${testRunId}`;

    const job = await emailJobRepository.create({
      campaign: { connect: { id: campaignId } },
      sender: { connect: { id: senderId } },
      recipient: `bull-recipient-${testRunId}@example.com`,
      subject: 'Bull Job Test',
      body: 'Idempotency test',
      scheduledAt: new Date(),
      bullJobId,
    });

    await expect(
      emailJobRepository.create({
        campaign: { connect: { id: campaignId } },
        sender: { connect: { id: senderId } },
        recipient: `bull-recipient-dup-${testRunId}@example.com`,
        subject: 'Bull Job Test',
        body: 'Idempotency test',
        scheduledAt: new Date(),
        bullJobId,
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await prisma.emailJob.delete({ where: { id: job.id } });
  });
});
