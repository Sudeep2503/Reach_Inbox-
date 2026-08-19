import { Queue } from 'bullmq';
import { redisConnectionConfig } from './connection.js';
import { env } from '../config/env.js';

export const emailQueue = new Queue(env.BULLMQ_QUEUE_NAME, {
  connection: redisConnectionConfig,
  defaultJobOptions: {
    removeOnComplete: {
      count: env.QUEUE_REMOVE_ON_COMPLETE,
    },
    removeOnFail: {
      count: env.QUEUE_REMOVE_ON_FAIL,
    },
    attempts: env.BULLMQ_JOB_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: env.BULLMQ_BACKOFF_DELAY,
    },
  },
});
