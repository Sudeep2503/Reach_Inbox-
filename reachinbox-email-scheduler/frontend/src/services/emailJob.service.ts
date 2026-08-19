import { apiClient } from './api';
import type { ApiCollectionResponse } from '../types/api';
import type { EmailJob } from '../types/email';

export interface EmailPage {
  items: EmailJob[];
  pagination: ApiCollectionResponse<EmailJob>['pagination'];
}

async function getPage(path: string, page: number): Promise<EmailPage> {
  const { data } = await apiClient.get<ApiCollectionResponse<EmailJob>>(path, {
    params: { page, limit: 20 },
  });
  return { items: data.data, pagination: data.pagination };
}

export const emailJobService = {
  getScheduledEmails: (page: number) => getPage('/email-jobs/scheduled', page),
  getSentEmails: (page: number) => getPage('/email-jobs/sent', page),
};