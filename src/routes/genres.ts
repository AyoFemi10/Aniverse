import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';
import { GenreParamsSchema, GenreQuerySchema } from '../schemas/genre.schema';
import { ValidationError } from '../utils/errors';

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

const genreAnimeItemShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    image: { type: 'string' },
    url: { type: 'string' },
    episodes: { type: 'integer' },
    type: { type: 'string' },
  },
} as const;

const genreRoute: FastifyPluginAsync = async (fastify) => {
  // ─── GET /genres ──────────────────────────────────────────────────────────────

  fastify.get(
    '/genres',
    {
      schema: {
        tags: ['genres'],
        summary: 'List all anime genres',
        description: 'Returns every available genre with its slug and AniVerse API URL.',
        response: {
          200: {
            description: 'Genre list',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              genres: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Genre slug' },
                    name: { type: 'string', description: 'Display name' },
                    url: { type: 'string' },
                  },
                },
              },
              total: { type: 'integer' },
              cached: { type: 'boolean' },
            },
          },
          500: errorSchema,
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const { data: genres, cached } = await aniwaveService.genres();
      return reply.send({ success: true, genres, total: genres.length, cached });
    },
  );

  // ─── GET /genres/:genre ───────────────────────────────────────────────────────

  fastify.get(
    '/genres/:genre',
    {
      schema: {
        tags: ['genres'],
        summary: 'Browse anime by genre',
        description: 'Returns a paginated list of anime for the specified genre slug.',
        params: {
          type: 'object',
          required: ['genre'],
          properties: {
            genre: { type: 'string', description: 'Genre slug (e.g. action, romance)' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1, description: 'Page number' },
          },
        },
        response: {
          200: {
            description: 'Anime in genre',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              genre: { type: 'string' },
              page: { type: 'integer' },
              hasNextPage: { type: 'boolean' },
              items: { type: 'array', items: genreAnimeItemShape },
              cached: { type: 'boolean' },
            },
          },
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = GenreParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.errors.map((e) => e.message).join(', '));
      }

      const queryParsed = GenreQuerySchema.safeParse(request.query);
      const page = queryParsed.success ? (queryParsed.data.page ?? 1) : 1;

      const { genre } = paramsParsed.data;
      const { data, cached } = await aniwaveService.genreAnime(genre, page);

      return reply.send({
        success: true,
        genre,
        page,
        hasNextPage: data.hasNextPage,
        items: data.items,
        cached,
      });
    },
  );
};

export default genreRoute;
