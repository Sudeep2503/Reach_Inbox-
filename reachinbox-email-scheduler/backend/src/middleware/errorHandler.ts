import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/apiError.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal Server Error';
  let details: unknown = undefined;

  // Handle Prisma Database Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      code = 'CONFLICT';
      const targets = (err.meta?.['target'] as string[]) || [];
      message = `Conflict: Field value already exists (${targets.join(', ')})`;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      code = 'RESOURCE_NOT_FOUND';
      message = 'Resource not found';
    } else {
      statusCode = 400;
      code = 'DATABASE_ERROR';
      message = 'Database operation failed';
    }
  } else if (err instanceof z.ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request data';
    details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  } else if (err instanceof Error && err.name === 'MulterError') {
    const multerError = err as Error & { code?: string };
    statusCode = 400;
    if (multerError.code === 'LIMIT_FILE_SIZE') {
      code = 'FILE_TOO_LARGE';
      message = `File size exceeds the limit of ${env.MAX_UPLOAD_SIZE_MB}MB`;
    } else {
      code = 'FILE_UPLOAD_ERROR';
      message = err.message;
    }
  } else if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof Error) {
    message = err.message;
  }

  const responseBody = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
    ...(env.NODE_ENV === 'development' && {
      stack: err instanceof Error ? err.stack : undefined,
      ...(err instanceof Prisma.PrismaClientKnownRequestError && { prismaCode: err.code }),
    }),
  };

  logger.error(
    {
      err: {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
      },
      requestId: req.headers['x-request-id'] || req.id,
      statusCode,
    },
    `Error processing request: ${err instanceof Error ? err.message : 'Unknown error'}`,
  );

  res.status(statusCode).json(responseBody);
}
