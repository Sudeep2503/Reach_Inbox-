import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from './auth/google.strategy.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimit } from './middleware/rateLimit.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  // Trust proxy for IP rate limiting if behind a reverse proxy (e.g. Nginx, Heroku)
  app.set('trust proxy', 1);

  // Security Headers
  app.use(helmet());

  // CORS Configuration supporting cookies
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true, // Enabled for session-based cookie authentication
    }),
  );

  // JSON Body Limit
  app.use(
    express.json({
      limit: '1mb',
    }),
  );

  // Cookie Parser (required to read session cookies)
  app.use(cookieParser());

  // Passport middleware initialization
  app.use(passport.initialize());

  // Request ID injection & request logging (Pino)
  app.use(requestLogger);

  // Apply basic API protection (rate limiter) to all API routes
  app.use('/api', rateLimit, apiRouter);

  // Error Handling for unmatched routes
  app.use(notFoundHandler);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}
