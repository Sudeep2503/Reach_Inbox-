import { apiClient } from './api';
import type { ApiResponse } from '../types/api';
import type { Sender } from '../types/sender';

export const senderService = {
  async getSenders(): Promise<Sender[]> {
    const { data } = await apiClient.get<ApiResponse<Sender[]>>('/senders');
    return data.data;
  },
};