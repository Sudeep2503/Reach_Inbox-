import { randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { sessionRepository } from '../repositories/session.repository.js';
import type { Session, User } from '@prisma/client';

export const authService = {
  async createSession(userId: string): Promise<Session> {
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.SESSION_TTL_DAYS);

    return sessionRepository.createSession(userId, sessionToken, expiresAt);
  },

  async validateSession(sessionToken: string): Promise<User | null> {
    const session = await sessionRepository.findByToken(sessionToken);
    if (!session) {
      return null;
    }

    const now = new Date();
    if (now > session.expiresAt) {
      // Expired! Delete session
      await sessionRepository.deleteByToken(sessionToken);
      return null;
    }

    return session.user;
  },

  async logout(sessionToken: string): Promise<void> {
    await sessionRepository.deleteByToken(sessionToken);
  },

  async cleanExpiredSessions(): Promise<number> {
    const result = await sessionRepository.deleteExpiredSessions();
    return result.count;
  },
};
