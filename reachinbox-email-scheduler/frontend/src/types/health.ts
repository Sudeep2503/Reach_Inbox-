export interface HealthServices {
  api: string;
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
}

export interface HealthResponse {
  success: boolean;
  data: {
    status: string;
    services: HealthServices;
    timestamp: string;
  };
}
