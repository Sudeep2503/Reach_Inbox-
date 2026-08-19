import { createEmailWorker } from './workers/email.worker.js';
import { smtpService } from './services/email/smtp.service.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

logger.info('Starting ReachInbox Worker process...');

let worker: ReturnType<typeof createEmailWorker> | null = null;
let isShuttingDown = false;

async function startWorker() {
  try {
    // 1. Connect to PostgreSQL
    await connectDatabase();

    // 2. Verify SMTP Connection
    await smtpService.verifyConnection();

    // 3. Initialize BullMQ Worker
    worker = createEmailWorker();
    logger.info('ReachInbox Worker process is ready');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ err: err.message }, 'Failed to start worker process — configuration error');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Gracefully shutting down worker process...');

  try {
    if (worker) {
      await worker.close();
      logger.info('BullMQ Worker closed successfully');
    }
    await disconnectDatabase();
    process.exit(0);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ err: err.message }, 'Error during worker graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void startWorker();
