import type { Prisma } from '@prisma/client';

export const senderSafeSelect = {
  id: true,
  userId: true,
  email: true,
  displayName: true,
  smtpHost: true,
  smtpPort: true,
  smtpUser: true,
  hourlyLimit: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SenderSelect;

export type SenderSafe = Prisma.SenderGetPayload<{ select: typeof senderSafeSelect }>;

export type CreateUserInput = Prisma.UserCreateInput;
export type UpdateUserInput = Prisma.UserUpdateInput;

export type CreateSenderInput = Prisma.SenderCreateInput;
export type UpdateSenderInput = Prisma.SenderUpdateInput;

export type CreateCampaignInput = Prisma.CampaignCreateInput;
export type UpdateCampaignInput = Prisma.CampaignUpdateInput;

export type CreateEmailJobInput = Prisma.EmailJobCreateInput;

export type { CampaignStatus, EmailJobStatus } from '@prisma/client';
