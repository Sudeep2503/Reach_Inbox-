import { checkDatabaseHealth } from '../config/database.js';
import { checkRedisHealth } from '../config/redis.js';

export const healthService = {
  async getHealthStatus() {
    const [databaseStatus, redisStatus] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isHealthy = databaseStatus === 'connected' && redisStatus === 'connected';

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      services: {
        api: 'up',
        database: databaseStatus,
        redis: redisStatus,
      },
      timestamp: new Date().toISOString(),
    };
  },
};
