import { apiClient } from './api';
import type { AuthResponse } from '../types/auth';

const apiBaseUrl = import.meta.env.VITE_API_URL;

if (!apiBaseUrl) {
  throw new Error('VITE_API_URL must be configured before starting the frontend.');
}

export const authService = {
  async getCurrentUser(): Promise<AuthResponse> {
    const { data } = await apiClient.get<AuthResponse>('/auth/me');
    return data;
  },

  async logout(): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<{ success: boolean }>('/auth/logout');
    return data;
  },

  getGoogleLoginUrl(): string {
    return `${apiBaseUrl}/auth/google`;
  },
};
