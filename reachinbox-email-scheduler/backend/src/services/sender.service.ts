import { senderRepository } from '../repositories/sender.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { ApiError } from '../utils/apiError.js';
import type { CreateSenderInput, UpdateSenderInput } from '../types/database.js';

interface SenderCreateData {
  userId: string;
  email: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  hourlyLimit?: number;
  isActive?: boolean;
}

interface SenderUpdateData {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  hourlyLimit?: number;
  isActive?: boolean;
}

export const senderService = {
  async getSenderById(id: string, userId: string) {
    const sender = await senderRepository.findSenderByIdForUser(id, userId);
    if (!sender) {
      throw ApiError.notFound('Sender not found');
    }
    return sender;
  },

  async listSenders(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return senderRepository.findByUserId(userId);
  },

  async createSender(data: SenderCreateData) {
    const { userId, email } = data;
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const existing = await senderRepository.findByEmailAndUser(userId, email);
    if (existing) {
      throw ApiError.conflict('A sender with this email already exists for this user');
    }

    const payload: CreateSenderInput = {
      user: { connect: { id: userId } },
      email: data.email,
      displayName: data.displayName,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPassword: data.smtpPassword,
      hourlyLimit: data.hourlyLimit ?? 200,
      isActive: data.isActive ?? true,
    };

    return senderRepository.create(payload);
  },

  async updateSender(id: string, userId: string, data: SenderUpdateData) {
    const sender = await senderRepository.findSenderByIdForUser(id, userId);
    if (!sender) {
      throw ApiError.notFound('Sender not found');
    }

    if (data.id !== undefined || data.userId !== undefined) {
      throw ApiError.forbidden('Cannot modify read-only fields id or userId');
    }

    const payload: UpdateSenderInput = {
      email: data.email,
      displayName: data.displayName,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPassword: data.smtpPassword,
      hourlyLimit: data.hourlyLimit,
      isActive: data.isActive,
    };

    return senderRepository.update(id, payload);
  },
};
