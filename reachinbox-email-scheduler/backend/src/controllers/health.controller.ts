import type { Request, Response } from 'express';
import { healthService } from '../services/health.service.js';
import { sendSuccess } from '../utils/response.js';

export const healthController = {
  getHealth: async (_req: Request, res: Response): Promise<void> => {
    const status = await healthService.getHealthStatus();
    // Return HTTP 200 with the healthy/unhealthy payload
    sendSuccess(res, status);
  },
};
