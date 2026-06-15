import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Singleton Redis client – shared by the cache utilities
export let redis: Redis;

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const isTesting = process.env.NODE_ENV === 'test';

  redis = new Redis(redisUrl, {
    // In tests retry immediately 0 times so we fail fast and fall back to noop
    maxRetriesPerRequest: isTesting ? 0 : 3,
    retryStrategy: isTesting ? () => null : (times) => {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
    enableReadyCheck: !isTesting,
    lazyConnect: true,
  });

  // Attach error handler BEFORE connect so no event is ever unhandled
  redis.on('error', () => {
    // silenced – connection failures are handled in the catch block below
  });

  try {
    await redis.connect();
    logger.info({ redisUrl }, 'Redis connected');
  } catch {
    if (!isTesting) {
      logger.error('Redis connection failed – caching will be disabled');
    }
    // Swap to a pure in-process noop – no network activity at all
    redis = createNoopRedis();
  }

  fastify.addHook('onClose', async () => {
    await redis.quit().catch(() => {});
    if (!isTesting) logger.info('Redis connection closed');
  });

  fastify.decorate('redis', redis);
};

/**
 * Pure in-process no-op stub – never touches the network.
 * Used when Redis is unavailable so the API keeps running without caching.
 */
function createNoopRedis(): Redis {
  // Cast a minimal object to Redis so TypeScript is satisfied
  const noop = {
    get: async () => null,
    set: async () => 'OK' as const,
    del: async () => 0,
    ping: async () => 'PONG' as const,
    quit: async () => 'OK' as const,
    on: () => noop,
    off: () => noop,
    removeListener: () => noop,
  } as unknown as Redis;
  return noop;
}

export default fp(redisPlugin, { name: 'redis' });

// Augment FastifyInstance with redis property
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}
