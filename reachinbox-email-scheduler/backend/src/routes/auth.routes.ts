import { Router } from 'express';
import passport from 'passport';
import { authController } from '../auth/auth.controller.js';
import { googleOAuthConfigured } from '../auth/google.strategy.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

export const authRouter = Router();

// Redirect to Google consent screen
authRouter.get(
  '/google',
  googleOAuthConfigured
    ? passport.authenticate('google', {
        scope: ['openid', 'profile', 'email'],
        session: false,
      })
    : (_req, _res, next) => next(ApiError.internal('Google OAuth is not configured.', 'OAUTH_NOT_CONFIGURED')),
);

// Callback endpoint after Google consent authentication
authRouter.get(
  '/google/callback',
  googleOAuthConfigured
    ? passport.authenticate('google', {
        failureRedirect: '/login?error=oauth_failed',
        session: false,
      })
    : (_req, _res, next) => next(ApiError.internal('Google OAuth is not configured.', 'OAUTH_NOT_CONFIGURED')),
  asyncHandler(authController.googleCallback),
);

// Get current user session profile
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(authController.getMe),
);

// Terminate session
authRouter.post(
  '/logout',
  asyncHandler(authController.logout),
);
