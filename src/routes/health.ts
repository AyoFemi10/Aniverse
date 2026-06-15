import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../plugins/redis';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check',
        description: 'Returns API uptime and dependency health.',
        response: {
          200: {
            description: 'Healthy',
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              uptime: { type: 'number' },
              redis: { type: 'string', enum: ['ok', 'unavailable'] },
              version: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      let redisStatus: 'ok' | 'unavailable' = 'unavailable';
      try {
        await redis.ping();
        redisStatus = 'ok';
      } catch {
        // Redis ping failed
      }

      return reply.send({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        redis: redisStatus,
        version: process.env.npm_package_version ?? '1.0.0',
        timestamp: new Date().toISOString(),
      });
    },
  );
};

export default healthRoute;
