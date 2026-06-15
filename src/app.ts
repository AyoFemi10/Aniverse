import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';

import redisPlugin from './plugins/redis';
import swaggerPlugin from './plugins/swagger';
import { logger } from './utils/logger';
import { ApiError } from './utils/errors';

import healthRoute from './routes/health';
import searchRoute from './routes/search';
import animeRoute from './routes/anime';
import streamRoute from './routes/streams';
import discoveryRoute from './routes/discovery';
import genreRoute from './routes/genres';
import infoRoute from './routes/info';
import imageRoute from './routes/image';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: logger as any,
    trustProxy: true,
    ajv: {
      customOptions: {
        strict: false,        // allows "example", "kind", "modifier" keywords
      },
    },
  });

  // ─── Security ────────────────────────────────────────────────────────────────
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // disabled so Swagger UI works
  });

  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? true,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });

  // ─── Rate Limiting ───────────────────────────────────────────────────────────
  await fastify.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
      },
    }),
  });

  // ─── Plugins ─────────────────────────────────────────────────────────────────
  await fastify.register(redisPlugin);
  await fastify.register(swaggerPlugin);

  // ─── Global Error Handler ────────────────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify validation error
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: error.message,
        },
      });
    }

    // Rate limit error (already formatted by builder above)
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
    }

    // Unknown error
    fastify.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  // ─── Not Found ───────────────────────────────────────────────────────────────
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  // ─── Routes ──────────────────────────────────────────────────────────────────
  const API_PREFIX = '/api/v1';

  await fastify.register(healthRoute);
  await fastify.register(searchRoute, { prefix: API_PREFIX });
  await fastify.register(animeRoute, { prefix: `${API_PREFIX}/anime` });
  await fastify.register(streamRoute, { prefix: `${API_PREFIX}/anime` });
  await fastify.register(infoRoute, { prefix: `${API_PREFIX}/anime` });
  await fastify.register(discoveryRoute, { prefix: API_PREFIX });
  await fastify.register(genreRoute, { prefix: API_PREFIX });
  await fastify.register(imageRoute, { prefix: API_PREFIX }); // GET /api/v1/image

  return fastify;
}
