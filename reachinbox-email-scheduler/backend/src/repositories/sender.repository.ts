import { prisma } from '../config/database.js';
import { senderSafeSelect, type CreateSenderInput, type SenderSafe, type UpdateSenderInput } from '../types/database.js';

export const senderRepository = {
  findById(id: string): Promise<SenderSafe | null> {
    return prisma.sender.findUnique({
      where: { id },
      select: senderSafeSelect,
    });
  },

  findSenderByIdForUser(id: string, userId: string): Promise<SenderSafe | null> {
    return prisma.sender.findFirst({
      where: { id, userId },
      select: senderSafeSelect,
    });
  },

  findByUserId(userId: string): Promise<SenderSafe[]> {
    return prisma.sender.findMany({
      where: { userId },
      select: senderSafeSelect,
      orderBy: { createdAt: 'asc' },
    });
  },

  findByEmailAndUser(userId: string, email: string): Promise<SenderSafe | null> {
    return prisma.sender.findUnique({
      where: {
        userId_email: { userId, email },
      },
      select: senderSafeSelect,
    });
  },

  create(data: CreateSenderInput): Promise<SenderSafe> {
    return prisma.sender.create({
      data,
      select: senderSafeSelect,
    });
  },

  update(id: string, data: UpdateSenderInput): Promise<SenderSafe> {
    return prisma.sender.update({
      where: { id },
      data,
      select: senderSafeSelect,
    });
  },

  listActiveByUser(userId: string): Promise<SenderSafe[]> {
    return prisma.sender.findMany({
      where: { userId, isActive: true },
      select: senderSafeSelect,
      orderBy: { createdAt: 'asc' },
    });
  },
};
