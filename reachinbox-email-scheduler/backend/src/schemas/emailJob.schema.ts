import { z } from 'zod';

export const emailJobParamsSchema = z.object({
  id: z.string().uuid('Invalid email job ID format'),
});

export const scheduledEmailsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  campaignId: z.string().uuid('Invalid campaign ID format').optional(),
  senderId: z.string().uuid('Invalid sender ID format').optional(),
  status: z.enum(['SCHEDULED', 'PROCESSING']).optional(),
});

export const sentEmailsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  campaignId: z.string().uuid('Invalid campaign ID format').optional(),
  senderId: z.string().uuid('Invalid sender ID format').optional(),
  status: z.enum(['SENT', 'FAILED']).optional(),
});
