/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
import type { Request, Response, NextFunction } from 'express';
import type { User as PrismaUser } from '@prisma/client';
import { env } from '../config/env.js';
import { authService } from './auth.service.js';
import { ApiError } from '../utils/apiError.js';

declare global {
  namespace Express {
    interface User extends PrismaUser {}
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;

  if (!token) {
    return next(ApiError.unauthorized('Authentication required', 'UNAUTHORIZED'));
  }

  try {
    const user = await authService.validateSession(token);
    if (!user) {
      // Clear invalid cookie
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.SESSION_COOKIE_SAME_SITE,
        path: '/',
      });
      return next(ApiError.unauthorized('Authentication session expired or invalid', 'UNAUTHORIZED'));
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;

  if (!token) {
    return next();
  }

  try {
    const user = await authService.validateSession(token);
    if (user) {
      req.user = user;
    }
    next();
  } catch {
    next();
  }
}
