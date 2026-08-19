import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../config/database.js';
import { authService } from '../auth/auth.service.js';
import { env } from '../config/env.js';
import * as redisConfig from '../config/redis.js';

const app = createApp();
const testRunId = Date.now().toString(36);

let userId: string;
let senderId: string;
let campaignId: string;
let emailJobId: string;
let sessionToken: string;

const testUserEmail = `api-user-${testRunId}@example.com`;
const testSenderEmail = `api-sender-${testRunId}@example.com`;

beforeAll(async () => {
  vi.spyOn(redisConfig, 'checkRedisHealth').mockResolvedValue('disconnected');
  await connectDatabase();

  // Create a user in database to link all tests
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      name: 'API Test User',
    },
  });
  userId = user.id;

  // Create a valid session token for the user
  const session = await authService.createSession(userId);
  sessionToken = session.sessionToken;
});

afterAll(async () => {
  // Clean up database entities
  if (sessionToken) {
    await prisma.session.deleteMany({ where: { sessionToken } }).catch(() => undefined);
  }
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

describe('API Health Endpoint', () => {
  it('should return health status for API, Database, and Redis', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBeDefined();
    expect(res.body.data.services.api).toBe('up');
    expect(res.body.data.services.database).toBe('connected');
    expect(res.body.data.services.redis).toBeDefined();
    expect(res.body.data.timestamp).toBeDefined();
  });
});

describe('API Route 404 and Error Handling', () => {
  it('should return a structured 404 for unknown endpoints', async () => {
    const res = await request(app).get('/api/invalid-endpoint-path');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(res.body.error.message).toContain('not found');
  });
});

describe('User Dev Endpoints', () => {
  it('should fetch user details', async () => {
    const res = await request(app)
      .get(`/api/users/${userId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(userId);
    expect(res.body.data.email).toBe(testUserEmail);
  });

  it('should return 404 for non-existent user ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/api/users/${fakeId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('should fail user validation for malformed ID', async () => {
    const res = await request(app)
      .get('/api/users/not-a-uuid')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });
});

describe('Sender Endpoints', () => {
  it('should create a sender successfully and omit smtpPassword in response', async () => {
    const res = await request(app)
      .post('/api/senders')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`])
      .send({
        userId,
        email: testSenderEmail,
        displayName: 'Test API Sender',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'test-user',
        smtpPassword: 'secret-password',
        hourlyLimit: 150,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.userId).toBe(userId);
    expect(res.body.data.email).toBe(testSenderEmail);
    expect(res.body.data).not.toHaveProperty('smtpPassword');

    senderId = res.body.data.id;
  });

  it('should enforce unique sender email per user', async () => {
    const res = await request(app)
      .post('/api/senders')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`])
      .send({
        userId,
        email: testSenderEmail,
        displayName: 'Duplicate Sender',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'test-user-2',
        smtpPassword: 'secret-password-2',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should list senders', async () => {
    const res = await request(app)
      .get('/api/senders')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].id).toBe(senderId);
  });

  it('should retrieve a single sender by ID without returning SMTP password', async () => {
    const res = await request(app)
      .get(`/api/senders/${senderId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(senderId);
    expect(res.body.data).not.toHaveProperty('smtpPassword');
  });

  it('should patch safe mutable fields only', async () => {
    const res = await request(app)
      .patch(`/api/senders/${senderId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`])
      .send({
        displayName: 'Updated API Sender Name',
        hourlyLimit: 250,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.displayName).toBe('Updated API Sender Name');
    expect(res.body.data.hourlyLimit).toBe(250);
  });

  it('should reject patches including read-only fields like userId', async () => {
    const res = await request(app)
      .patch(`/api/senders/${senderId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`])
      .send({
        userId: 'e012e84d-2bb0-4d57-8ea3-3c97dbceb0e5',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Campaign and EmailJob Endpoints', () => {
  beforeAll(async () => {
    // Create a mock campaign and email job directly in database for read endpoints testing
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        subject: 'API Test Subject',
        body: 'API Test Body',
        startTime: new Date(),
        delayMs: 2000,
        hourlyLimit: 200,
        status: 'SCHEDULED',
        totalRecipients: 2,
        scheduledCount: 2,
      },
    });
    campaignId = campaign.id;

    const job = await prisma.emailJob.create({
      data: {
        campaignId,
        senderId,
        recipient: 'recipient-1@example.com',
        subject: 'API Test Subject',
        body: 'API Test Body',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
      },
    });
    emailJobId = job.id;

    await prisma.emailJob.create({
      data: {
        campaignId,
        senderId,
        recipient: 'recipient-2@example.com',
        subject: 'API Test Subject',
        body: 'API Test Body',
        scheduledAt: new Date(),
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  });

  it('should list campaigns', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].id).toBe(campaignId);
  });

  it('should retrieve a single campaign by ID', async () => {
    const res = await request(app)
      .get(`/api/campaigns/${campaignId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(campaignId);
    expect(res.body.data.subject).toBe('API Test Subject');
  });

  it('should fetch campaign stats from DB values', async () => {
    const res = await request(app)
      .get(`/api/campaigns/${campaignId}/stats`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalRecipients).toBe(2);
    expect(res.body.data.scheduledCount).toBe(2);
    expect(res.body.data.sentCount).toBe(0);
  });

  it('should list paginated campaign emails with query filtering', async () => {
    const res = await request(app)
      .get(`/api/campaigns/${campaignId}/emails?page=1&limit=1`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('should fetch scheduled emails lists and verify sorting', async () => {
    const res = await request(app)
      .get('/api/email-jobs/scheduled?page=1&limit=10')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].status).toBe('SCHEDULED');
  });

  it('should fetch sent/failed emails lists', async () => {
    const res = await request(app)
      .get('/api/email-jobs/sent?page=1&limit=10')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].status).toBe('SENT');
  });

  it('should fetch single email job by ID', async () => {
    const res = await request(app)
      .get(`/api/email-jobs/${emailJobId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(emailJobId);
  });
});

describe('CORS and Request ID Headers', () => {
  it('should generate X-Request-ID header when missing and return it', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should reuse a valid X-Request-ID header supplied by client', async () => {
    const customId = 'abcdef12-3456-7890-abcd-ef1234567890';
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-ID', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });
});
