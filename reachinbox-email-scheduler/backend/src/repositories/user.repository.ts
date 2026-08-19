import type { User } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { CreateUserInput, UpdateUserInput } from '../types/database.js';

export const userRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByGoogleId(googleId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { googleId } });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  create(data: CreateUserInput): Promise<User> {
    return prisma.user.create({ data });
  },

  update(id: string, data: UpdateUserInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  },
};
