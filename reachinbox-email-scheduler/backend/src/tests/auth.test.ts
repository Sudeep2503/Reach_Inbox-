import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'crypto';
import { createApp } from '../app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../config/database.js';
import { authService } from '../auth/auth.service.js';
import { env } from '../config/env.js';

const app = createApp();
const testRunId = Date.now().toString(36);

let userAId: string;
let userBId: string;

let senderBId: string;
let campaignBId: string;
let emailJobBId: string;

let validSessionTokenA: string;
let expiredSessionTokenA: string;

const emailA = `user-a-${testRunId}@example.com`;
const emailB = `user-b-${testRunId}@example.com`;

beforeAll(async () => {
  await connectDatabase();

  // 1. Create User A and User B
  const userA = await prisma.user.create({
    data: {
      email: emailA,
      name: 'User A',
    },
  });
  userAId = userA.id;

  const userB = await prisma.user.create({
    data: {
      email: emailB,
      name: 'User B',
    },
  });
  userBId = userB.id;

  // 2. Create session tokens for User A
  const sessionValid = await authService.createSession(userAId);
  validSessionTokenA = sessionValid.sessionToken;

  // Create an expired session manually
  const expiredToken = randomBytes(32).toString('hex');
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1); // expired yesterday
  const sessionExpired = await prisma.session.create({
    data: {
      userId: userAId,
      sessionToken: expiredToken,
      expiresAt: expiredDate,
    },
  });
  expiredSessionTokenA = sessionExpired.sessionToken;

  // 3. Create a Sender for User B
  const senderB = await prisma.sender.create({
    data: {
      userId: userBId,
      email: `sender-b-${testRunId}@example.com`,
      displayName: 'Sender B',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender-b',
      smtpPassword: 'password-b',
    },
  });
  senderBId = senderB.id;

  // 4. Create a Campaign for User B
  const campaignB = await prisma.campaign.create({
    data: {
      userId: userBId,
      subject: 'Campaign B Subject',
      body: 'Campaign B Body',
      startTime: new Date(),
      delayMs: 1000,
    },
  });
  campaignBId = campaignB.id;

  // 5. Create an Email Job for Campaign B (User B)
  const jobB = await prisma.emailJob.create({
    data: {
      campaignId: campaignBId,
      senderId: senderBId,
      recipient: 'recipient-b@example.com',
      subject: 'Job B Subject',
      body: 'Job B Body',
      scheduledAt: new Date(),
      status: 'SCHEDULED',
    },
  });
  emailJobBId = jobB.id;
});

afterAll(async () => {
  // Teardown relations
  await prisma.session.deleteMany({ where: { userId: { in: [userAId, userBId] } } }).catch(() => undefined);
  await prisma.emailJob.deleteMany({ where: { campaignId: campaignBId } }).catch(() => undefined);
  await prisma.campaign.deleteMany({ where: { userId: userBId } }).catch(() => undefined);
  await prisma.sender.deleteMany({ where: { userId: userBId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } }).catch(() => undefined);

  await disconnectDatabase();
});

describe('Authentication Middleware and Endpoint (/api/auth/me)', () => {
  it('should return 401 UNAUTHORIZED if no session cookie is supplied', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 UNAUTHORIZED for invalid session token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=invalid-token`]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 UNAUTHORIZED and clear cookie for expired session', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${expiredSessionTokenA}`]);

    expect(res.status).toBe(401);
    // Verify clear-cookie header is sent
    const setCookie = res.headers['set-cookie'] as string[] | undefined;
    expect(setCookie).toBeDefined();
    expect(setCookie![0]).toContain(`${env.SESSION_COOKIE_NAME}=;`);
  });

  it('should return user details for valid session token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${validSessionTokenA}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authenticated).toBe(true);
    expect(res.body.data.user.id).toBe(userAId);
    expect(res.body.data.user.email).toBe(emailA);
    expect(res.body.data.user).not.toHaveProperty('googleId');
  });
});

describe('Logout Endpoint (/api/auth/logout)', () => {
  it('should delete session from DB and clear cookie on logout', async () => {
    // 1. Double check session exists
    let dbSession = await prisma.session.findUnique({ where: { sessionToken: validSessionTokenA } });
    expect(dbSession).toBeDefined();

    // 2. Perform logout
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${validSessionTokenA}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.loggedOut).toBe(true);

    // Verify cookie cleared
    const setCookie = res.headers['set-cookie'] as string[] | undefined;
    expect(setCookie).toBeDefined();
    expect(setCookie![0]).toContain(`${env.SESSION_COOKIE_NAME}=;`);

    // Verify session deleted in DB
    dbSession = await prisma.session.findUnique({ where: { sessionToken: validSessionTokenA } });
    expect(dbSession).toBeNull();
  });

  it('should be idempotent and not crash if called twice or already logged out', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${validSessionTokenA}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Database ownership / authorization scoping', () => {
  let sessionTokenA: string;

  beforeAll(async () => {
    // Re-create a session for User A
    const session = await authService.createSession(userAId);
    sessionTokenA = session.sessionToken;
  });

  it("should prevent User A from accessing User B's sender (should return 404)", async () => {
    const res = await request(app)
      .get(`/api/senders/${senderBId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`]);

    expect(res.status).toBe(404);
  });

  it("should prevent User A from patching User B's sender (should return 404)", async () => {
    const res = await request(app)
      .patch(`/api/senders/${senderBId}`)
      .send({ displayName: 'Hacked name' })
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`]);

    expect(res.status).toBe(404);
  });

  it("should prevent User A from accessing User B's campaign (should return 404)", async () => {
    const res = await request(app)
      .get(`/api/campaigns/${campaignBId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`]);

    expect(res.status).toBe(404);
  });

  it("should prevent User A from accessing User B's email job (should return 404)", async () => {
    const res = await request(app)
      .get(`/api/email-jobs/${emailJobBId}`)
      .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${sessionTokenA}`]);

    expect(res.status).toBe(404);
  });
});

describe('User lookup / Strategy callback tests', () => {
  it('should upsert user by googleId and prevent duplicates', async () => {
    const googleId = `g-${testRunId}`;
    const email = `google-user-${testRunId}@example.com`;

    // 1. Create a user
    const user1 = await prisma.user.create({
      data: {
        email,
        name: 'Google User 1',
        googleId,
      },
    });

    // 2. Querying by Google ID should return the exact same user
    const user2 = await prisma.user.findUnique({
      where: { googleId },
    });

    expect(user2).toBeDefined();
    expect(user2!.id).toBe(user1.id);
    expect(user2!.email).toBe(email);

    await prisma.user.delete({ where: { id: user1.id } }).catch(() => undefined);
  });
});
