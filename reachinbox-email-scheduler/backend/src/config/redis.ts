import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;

export function createRedisClient(): Redis {
  const client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    // Rate-limit commands must fail closed promptly when Redis is unavailable.
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    commandTimeout: 1000,
    retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    lazyConnect: true,
  });

  client.on('connect', () => {
    logger.info({ host: env.REDIS_HOST, port: env.REDIS_PORT }, 'Redis connected');
  });

  client.on('error', (error: Error) => {
    logger.error({ err: error }, 'Redis connection error');
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();

  if (client.status === 'ready' || client.status === 'connecting') {
    return;
  }

  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();
  redisClient = null;
  logger.info('Redis disconnected gracefully');
}

export async function checkRedisHealth(): Promise<'connected' | 'disconnected'> {
  try {
    const client = getRedisClient();

    if (client.status !== 'ready') {
      await connectRedis();
    }

    const pong = await client.ping();

    return pong === 'PONG' ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}

// BullMQ queue placeholder — workers and job definitions will be added in a future phase.
