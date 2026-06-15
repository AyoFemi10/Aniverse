import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Singleton Redis client – shared by the cache utilities
export let redis: Redis;

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 5) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
    enableReadyCheck: true,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    logger.info({ redisUrl }, 'Redis connected');
  } catch (err) {
    logger.error({ err }, 'Redis connection failed – caching will be disabled');
    // Replace with a no-op stub so the app stays alive without Redis
    redis = createNoopRedis();
  }

  redis.on('error', (err) => logger.error({ err }, 'Redis error'));

  fastify.addHook('onClose', async () => {
    await redis.quit().catch(() => {});
    logger.info('Redis connection closed');
  });

  fastify.decorate('redis', redis);
};

/**
 * No-op Redis stub so the API runs gracefully when Redis is unavailable.
 */
function createNoopRedis(): Redis {
  const noop = new Redis({ lazyConnect: true });
  noop.get = async () => null;
  noop.set = async () => 'OK';
  noop.del = async () => 0;
  noop.quit = async () => 'OK';
  return noop;
}

export default fp(redisPlugin, { name: 'redis' });

// Augment FastifyInstance with redis property
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}
