import { z } from 'zod';

export const createSenderSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  email: z.string().email('Invalid email format'),
  displayName: z.string().min(1, 'Display name is required'),
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.number().int().positive('SMTP port must be a positive integer'),
  smtpUser: z.string().min(1, 'SMTP user is required'),
  smtpPassword: z.string().min(1, 'SMTP password is required'),
  hourlyLimit: z.number().int().positive('Hourly limit must be positive').optional().default(200),
  isActive: z.boolean().optional().default(true),
});

export const updateSenderSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  displayName: z.string().min(1, 'Display name cannot be empty').optional(),
  smtpHost: z.string().min(1, 'SMTP host cannot be empty').optional(),
  smtpPort: z.number().int().positive('SMTP port must be a positive integer').optional(),
  smtpUser: z.string().min(1, 'SMTP user cannot be empty').optional(),
  smtpPassword: z.string().min(1, 'SMTP password cannot be empty').optional(),
  hourlyLimit: z.number().int().positive('Hourly limit must be positive').optional(),
  isActive: z.boolean().optional(),
}).strict(); // strict ensures client doesn't send id or userId

export const senderParamsSchema = z.object({
  id: z.string().uuid('Invalid sender ID format'),
});

export const senderQuerySchema = z.object({
  userId: z.string().uuid('Invalid user ID format').optional(),
});
