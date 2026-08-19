import type { Session, User, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

export const sessionRepository = {
  createSession(userId: string, sessionToken: string, expiresAt: Date): Promise<Session> {
    return prisma.session.create({
      data: {
        userId,
        sessionToken,
        expiresAt,
      },
    });
  },

  findByToken(sessionToken: string): Promise<(Session & { user: User }) | null> {
    return prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
  },

  async deleteByToken(sessionToken: string): Promise<Prisma.BatchPayload> {
    return prisma.session.deleteMany({
      where: { sessionToken },
    });
  },

  async deleteByUserId(userId: string): Promise<Prisma.BatchPayload> {
    return prisma.session.deleteMany({
      where: { userId },
    });
  },

  async deleteExpiredSessions(): Promise<Prisma.BatchPayload> {
    return prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
  },
};
