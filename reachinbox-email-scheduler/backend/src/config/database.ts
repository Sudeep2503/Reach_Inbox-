import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? [
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });

  client.$on('error', (event) => {
    logger.error({ target: event.target, message: event.message }, 'Prisma client error');
  });

  client.$on('warn', (event) => {
    logger.warn({ target: event.target, message: event.message }, 'Prisma client warning');
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('PostgreSQL connected');
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('PostgreSQL disconnected gracefully');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting PostgreSQL');
    throw error;
  }
}

export async function checkDatabaseHealth(): Promise<'connected' | 'disconnected'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch (error) {
    logger.debug({ err: error }, 'Database health check failed');
    return 'disconnected';
  }
}
