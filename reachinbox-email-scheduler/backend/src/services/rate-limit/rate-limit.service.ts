import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRedisClient } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hourlyScript = fs.readFileSync(path.join(__dirname, 'hourly-limit.lua'), 'utf8');
const releaseHourlyScript = fs.readFileSync(path.join(__dirname, 'release-hourly-limit.lua'), 'utf8');
const delayScript = fs.readFileSync(path.join(__dirname, 'minimum-delay.lua'), 'utf8');

export class RedisUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  windowStart: Date;
  windowEnd: Date;
  retryAt?: Date;
}

export interface ThrottleDecision {
  allowed: boolean;
  retryAt?: Date;
  waitMs?: number;
}

export const rateLimitService = {
  async releaseHourlySlot(senderId: string, windowStart: Date): Promise<void> {
    const key = `${env.RATE_LIMIT_KEY_PREFIX}:${senderId}:${windowStart.toISOString()}`;
    try {
      await getRedisClient().eval(releaseHourlyScript, 1, key);
    } catch (error) {
      logger.error({ err: error, senderId }, 'Redis error while releasing a deferred hourly slot');
      throw new RedisUnavailableError('Redis connection failed while releasing rate limit slot');
    }
  },

  async reserveHourlySlot(senderId: string): Promise<RateLimitDecision> {
    const now = new Date();
    const windowDurationMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowDurationMs) * windowDurationMs);
    const windowEnd = new Date(windowStart.getTime() + windowDurationMs - 1);
    const key = `${env.RATE_LIMIT_KEY_PREFIX}:${senderId}:${windowStart.toISOString()}`;
    const limit = env.MAX_EMAILS_PER_HOUR_PER_SENDER;
    
    // Keep the fixed UTC-hour key alive only slightly beyond its window.
    const ttlSeconds = Math.max(
      1,
      Math.ceil((windowEnd.getTime() - now.getTime()) / 1000)
        + Math.ceil(env.RATE_LIMIT_SAFETY_BUFFER_MS / 1000),
    );

    try {
      const client = getRedisClient();
      const result = await client.eval(
        hourlyScript,
        1,
        key,
        limit,
        Math.ceil(ttlSeconds)
      );

      const [allowedNum, currentNum] = result as [number, number];
      const allowed = allowedNum === 1;
      const remaining = Math.max(0, limit - currentNum);

      if (allowed) {
        logger.info({ senderId, key, limit, remaining }, 'Hourly rate limit slot reserved successfully');
        return {
          allowed: true,
          remaining,
          limit,
          windowStart,
          windowEnd,
        };
      } else {
        // Retry at the beginning of the next hour window
        const nextWindowStart = new Date(windowStart.getTime() + windowDurationMs);
        logger.warn({ senderId, limit, nextWindowStart }, 'Hourly rate limit exhausted for sender');
        return {
          allowed: false,
          remaining: 0,
          limit,
          windowStart,
          windowEnd,
          retryAt: nextWindowStart,
        };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'RedisUnavailableError') {
        throw error;
      }
      logger.error({ err: error, senderId }, 'Redis error during hourly rate limit check');
      throw new RedisUnavailableError('Redis connection failed during rate limit check');
    }
  },

  async reserveMinimumDelaySlot(senderId: string): Promise<ThrottleDecision> {
    const key = `${env.THROTTLE_KEY_PREFIX}:${senderId}`;
    const minDelay = env.MIN_DELAY_BETWEEN_EMAILS;
    
    // A throttle reservation is meaningful only for the next delay interval.
    const ttlSeconds = Math.max(
      1,
      Math.ceil((minDelay + env.RATE_LIMIT_SAFETY_BUFFER_MS) / 1000) + 1,
    );

    try {
      const client = getRedisClient();
      const result = await client.eval(
        delayScript,
        1,
        key,
        minDelay,
        Date.now(),
        ttlSeconds
      );

      const [allowedNum, val] = result as [number, number];
      const allowed = allowedNum === 1;

      if (allowed) {
        return { allowed: true };
      } else {
        const nextAllowedTime = new Date(val);
        const waitMs = nextAllowedTime.getTime() - Date.now();
        logger.warn({ senderId, nextAllowedTime, waitMs }, 'Minimum delay spacing throttle applied');
        return {
          allowed: false,
          retryAt: nextAllowedTime,
          waitMs,
        };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'RedisUnavailableError') {
        throw error;
      }
      logger.error({ err: error, senderId }, 'Redis error during minimum delay throttle check');
      throw new RedisUnavailableError('Redis connection failed during delay check');
    }
  },

  async getSenderRateLimitStatus(senderId: string): Promise<{
    limit: number;
    used: number;
    remaining: number;
    windowStart: string;
    windowEnd: string;
    minimumDelayMs: number;
  }> {
    const now = new Date();
    const windowDurationMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowDurationMs) * windowDurationMs);
    const windowEnd = new Date(windowStart.getTime() + windowDurationMs - 1);
    const key = `${env.RATE_LIMIT_KEY_PREFIX}:${senderId}:${windowStart.toISOString()}`;

    try {
      const client = getRedisClient();
      const val = await client.get(key);
      const used = val ? parseInt(val, 10) : 0;
      const limit = env.MAX_EMAILS_PER_HOUR_PER_SENDER;
      const remaining = Math.max(0, limit - used);

      return {
        limit,
        used,
        remaining,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        minimumDelayMs: env.MIN_DELAY_BETWEEN_EMAILS,
      };
    } catch (error) {
      logger.error({ err: error, senderId }, 'Failed to fetch sender rate limit status');
      throw new RedisUnavailableError('Redis connection failed');
    }
  }
};
