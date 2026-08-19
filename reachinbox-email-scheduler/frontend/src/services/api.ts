import axios from 'axios';
import type { ApiErrorResponse } from '../types/api';
import type { HealthResponse } from '../types/health';

const apiBaseUrl = import.meta.env.VITE_API_URL;

if (!apiBaseUrl) {
  throw new Error('VITE_API_URL must be configured before starting the frontend.');
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
  withCredentials: true, // Crucial for sending/receiving session cookies
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<ApiErrorResponse>(error)) {
      const message = error.response?.data?.error?.message;
      if (message) {
        error.message = message;
      } else if (!error.response) {
        error.message = 'Unable to reach ReachInbox. Check that the backend is running.';
      }
    }
    return Promise.reject(error);
  },
);

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/health');
  return data;
}
