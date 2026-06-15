import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';
import { AnimeParamsSchema } from '../schemas/anime.schema';
import { ValidationError } from '../utils/errors';

// Reusable inline error response shape (avoids $ref which requires Swagger to be ready)
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

const animeRoute: FastifyPluginAsync = async (fastify) => {
  // ─── GET /anime/:id ──────────────────────────────────────────────────────────

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['anime'],
        summary: 'Get anime details',
        description: 'Fetch full details for a single anime by its ID (slug).',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Anime slug (e.g. naruto-123)' },
          },
        },
        response: {
          200: {
            description: 'Anime details',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              anime: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  aliases: { type: 'string' },
                  aired: { type: 'string' },
                  image: { type: 'string' },
                  genres: { type: 'array', items: { type: 'string' } },
                  status: { type: 'string' },
                  rating: { type: 'string' },
                },
              },
              cached: { type: 'boolean' },
            },
          },
          404: errorSchema,
          400: errorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = AnimeParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
      }
      const { data: anime, cached } = await aniwaveService.details(parsed.data.id);
      return reply.send({ success: true, anime, cached });
    },
  );

  // ─── GET /anime/:id/episodes ─────────────────────────────────────────────────

  fastify.get(
    '/:id/episodes',
    {
      schema: {
        tags: ['anime'],
        summary: 'List episodes for an anime',
        description: 'Returns all available episodes with their stream-ready URLs.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Anime slug' },
          },
        },
        response: {
          200: {
            description: 'Episode list',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              episodes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'integer' },
                    url: { type: 'string' },
                  },
                },
              },
              total: { type: 'integer' },
              cached: { type: 'boolean' },
            },
          },
          404: errorSchema,
          400: errorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = AnimeParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
      }
      const { data: episodes, cached } = await aniwaveService.episodes(parsed.data.id);
      return reply.send({ success: true, episodes, total: episodes.length, cached });
    },
  );
};

export default animeRoute;
