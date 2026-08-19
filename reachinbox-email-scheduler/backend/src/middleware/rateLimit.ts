import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError.js';

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const LIMIT = 200; // 200 requests
const WINDOW_MS = 60 * 1000; // per 1 minute

export function rateLimit(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const rateInfo = rateLimitMap.get(ip);

  if (!rateInfo || now > rateInfo.resetTime) {
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });
    return next();
  }

  rateInfo.count += 1;

  if (rateInfo.count > LIMIT) {
    return next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Too many requests. Please try again later.'));
  }

  next();
}
