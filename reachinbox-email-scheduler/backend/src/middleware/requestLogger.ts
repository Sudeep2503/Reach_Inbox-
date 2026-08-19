/* eslint-disable @typescript-eslint/no-namespace */
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../config/logger.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Extract or generate X-Request-ID
  let requestId = req.header('x-request-id');
  if (!requestId || !UUID_REGEX.test(requestId)) {
    requestId = randomUUID();
  }

  req.id = requestId;
  res.setHeader('x-request-id', requestId);

  const startTime = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    logger.info(
      {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration: `${durationMs}ms`,
        requestId: req.id,
      },
      `${req.method} ${req.originalUrl || req.url} - ${res.statusCode} in ${durationMs}ms`,
    );
  });

  next();
}
