import { z } from 'zod';

export const campaignParamsSchema = z.object({
  id: z.string().uuid('Invalid campaign ID format'),
});

export const campaignQuerySchema = z.object({
  userId: z.string().uuid('Invalid user ID format').optional(),
});

export const campaignEmailsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  senderId: z.string().uuid('Invalid sender ID format').optional(),
  status: z.enum(['SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED']).optional(),
});

export const createCampaignSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(500, 'Subject is too long'),
  body: z.string().min(1, 'Body is required'),
  senderId: z.string().uuid('Invalid sender ID format'),
  startTime: z.string().datetime({ message: 'Start time must be a valid ISO 8601 datetime' })
    .refine((val) => new Date(val) > new Date(), {
      message: 'Start time must be in the future',
    }),
  delayMs: z.coerce.number().int().min(0),
  hourlyLimit: z.coerce.number().int().min(1),
});
