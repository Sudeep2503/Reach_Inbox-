import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),

  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  SESSION_COOKIE_NAME: z.string().default('reachinbox_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  SESSION_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().url('GOOGLE_CALLBACK_URL must be a valid URL'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive().default(200),
  MIN_DELAY_BETWEEN_EMAILS: z.coerce.number().int().nonnegative().default(2000),

  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(5),
  BATCH_INSERT_SIZE: z.coerce.number().int().positive().default(500),
  MAX_CAMPAIGN_DELAY_MS: z.coerce.number().int().positive().default(3600000),
  MAX_CAMPAIGN_HOURLY_LIMIT: z.coerce.number().int().positive().default(10000),

  BULLMQ_QUEUE_NAME: z.string().default('email-sending'),
  QUEUE_REMOVE_ON_COMPLETE: z.coerce.number().int().positive().default(1000),
  QUEUE_REMOVE_ON_FAIL: z.coerce.number().int().positive().default(5000),
  BULLMQ_JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
  BULLMQ_BACKOFF_DELAY: z.coerce.number().int().positive().default(5000),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z
    .string()
    .default('')
    .transform((value) => (value === '' ? undefined : Number(value)))
    .pipe(z.number().int().positive().optional()),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  EMAIL_FROM_NAME: z.string().default('ReachInbox Scheduler'),
  EMAIL_FROM_ADDRESS: z.string().default(''),

  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),
  RATE_LIMIT_SAFETY_BUFFER_MS: z.coerce.number().int().nonnegative().default(100),
  RATE_LIMIT_KEY_PREFIX: z.string().default('reachinbox:rate'),
  THROTTLE_KEY_PREFIX: z.string().default('reachinbox:throttle'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  console.error('Invalid environment variables:\n', formatted);
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === 'production' && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) {
  console.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production.');
  process.exit(1);
}

export type Env = typeof env;
