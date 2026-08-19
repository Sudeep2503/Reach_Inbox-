import type { EmailJob } from '@prisma/client';

export type EmailJobResponse = EmailJob;
export type EmailJobResponseSafe = Omit<EmailJob, 'bullJobId'>;
