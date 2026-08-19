export type EmailJobStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

export interface EmailJob {
  id: string;
  recipient: string;
  subject: string;
  status: EmailJobStatus;
  scheduledAt?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  previewUrl?: string | null;
  errorMessage?: string | null;
  campaignId?: string;
  senderId?: string;
  nextAttemptAt?: string | null;
}