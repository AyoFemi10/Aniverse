import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';

/**
 * Build a test instance of the Fastify app.
 * Redis is automatically stubbed via the no-op fallback in the redis plugin
 * when REDIS_URL is unreachable during tests.
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  // Point to a non-existent Redis so the plugin falls back to the no-op stub
  process.env.REDIS_URL = 'redis://localhost:16379';
  process.env.NODE_ENV = 'test';

  const app = await buildApp();
  await app.ready();
  return app;
}
