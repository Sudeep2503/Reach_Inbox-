export type CampaignStatus = 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED';

export interface Campaign {
  id: string;
  subject: string;
  body: string;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  status: CampaignStatus;
  totalRecipients: number;
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

export interface CampaignStats {
  totalRecipients: number;
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  completionPercentage?: number;
}

export interface ScheduleResponse {
  campaign: Campaign;
  recipients: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
  queue: { scheduled: number; failed: number };
}