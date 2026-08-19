import type { Campaign } from '@prisma/client';

export type CampaignResponse = Campaign;

export interface CampaignStats {
  totalRecipients: number;
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
}
