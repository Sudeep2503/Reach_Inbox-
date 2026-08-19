import { createApp } from './app.js';
import {
  connectDatabase,
  disconnectDatabase,
  connectRedis,
  disconnectRedis,
  env,
  logger,
} from './config/index.js';

const app = createApp();

let server: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    try {
      await connectRedis();
    } catch (error) {
      logger.warn(
        { err: error },
        'Redis unavailable at startup — health check will report disconnected',
      );
    }

    server = app.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          services: {
            api: 'up',
            database: 'connected',
            redis: 'connected or pending',
          },
        },
        'ReachInbox backend is ready',
      );
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server — PostgreSQL connection required');
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Received shutdown signal');

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      logger.info('HTTP server closed');
    }

    await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void startServer();
