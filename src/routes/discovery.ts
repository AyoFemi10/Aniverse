import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const;

const discoverySchema = (summary: string, description: string) => ({
  tags: ['discovery'],
  summary,
  description,
  response: {
    200: {
      description: 'List of anime',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              image: { type: 'string' },
              url: { type: 'string' },
              episodes: { type: 'integer' },
              type: { type: 'string' },
            },
          },
        },
        cached: { type: 'boolean' },
      },
    },
    500: errorSchema,
  },
});

const discoveryRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/trending',
    { schema: discoverySchema('Trending anime', 'Returns currently trending anime.') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const { data: items, cached } = await aniwaveService.trending();
      return reply.send({ success: true, items, cached });
    },
  );

  fastify.get(
    '/recent',
    { schema: discoverySchema('Recently updated anime', 'Returns anime with recently added episodes.') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const { data: items, cached } = await aniwaveService.recent();
      return reply.send({ success: true, items, cached });
    },
  );

  fastify.get(
    '/popular',
    { schema: discoverySchema('Most popular anime', 'Returns the most-watched anime.') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const { data: items, cached } = await aniwaveService.popular();
      return reply.send({ success: true, items, cached });
    },
  );
};

export default discoveryRoute;
