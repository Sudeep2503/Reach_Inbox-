import { apiClient } from './api';
import type { ApiResponse } from '../types/api';
import type { Campaign, CampaignStats, ScheduleResponse } from '../types/campaign';

export interface CreateCampaignInput {
  subject: string;
  body: string;
  senderId: string;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  file: File;
}

export const campaignService = {
  async getCampaigns(): Promise<Campaign[]> {
    const { data } = await apiClient.get<ApiResponse<Campaign[]>>('/campaigns');
    return data.data;
  },

  async getCampaignStats(id: string): Promise<CampaignStats> {
    const { data } = await apiClient.get<ApiResponse<CampaignStats>>(`/campaigns/${id}/stats`);
    return data.data;
  },

  async createCampaign(input: CreateCampaignInput): Promise<ScheduleResponse> {
    const formData = new FormData();
    formData.append('subject', input.subject);
    formData.append('body', input.body);
    formData.append('senderId', input.senderId);
    formData.append('startTime', input.startTime);
    formData.append('delayMs', String(input.delayMs));
    formData.append('hourlyLimit', String(input.hourlyLimit));
    formData.append('file', input.file);

    const { data } = await apiClient.post<ApiResponse<ScheduleResponse>>('/campaigns', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
};