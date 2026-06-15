import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';
import { GenreParamsSchema, GenreQuerySchema } from '../schemas/genre.schema';
import { ValidationError } from '../utils/errors';

// Shared shape for a genre anime item
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
};

const genreRoute: FastifyPluginAsync = async (fastify) => {
  // ─── GET /genres ─────────────────────────────────────────────────────────────
  // Returns the full list of available genres
  fastify.get(
    '/genres',
    {
      schema: {
        tags: ['genres'],
        summary: 'List all anime genres',
        description: 'Returns every genre available on AniWave with its slug and URL.',
        response: {
          200: {
            description: 'Genre list',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              genres: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Genre slug', example: 'action' },
                    name: { type: 'string', description: 'Display name', example: 'Action' },
                    url: { type: 'string' },
                  },
                },
              },
              total: { type: 'integer' },
              cached: { type: 'boolean' },
            },
          },
          500: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const { data: genres, cached } = await aniwaveService.genres();
      return reply.send({
        success: true,
        genres,
        total: genres.length,
        cached,
      });
    },
  );

  // ─── GET /genres/:genre ──────────────────────────────────────────────────────
  // Browse anime within a specific genre
  fastify.get(
    '/genres/:genre',
    {
      schema: {
        tags: ['genres'],
        summary: 'Browse anime by genre',
        description:
          'Returns a paginated list of anime for the specified genre slug. ' +
          'Use the `page` query param to paginate.',
        params: {
          type: 'object',
          required: ['genre'],
          properties: {
            genre: {
              type: 'string',
              description: 'Genre slug (e.g. action, romance, fantasy)',
              example: 'action',
            },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
              default: 1,
              description: 'Page number',
            },
          },
        },
        response: {
          200: {
            description: 'Anime in genre',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              genre: { type: 'string' },
              page: { type: 'integer' },
              hasNextPage: { type: 'boolean' },
              items: { type: 'array', items: genreAnimeItemShape },
              cached: { type: 'boolean' },
            },
          },
          400: { $ref: '#/components/schemas/ErrorResponse' },
          404: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = GenreParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.errors.map((e) => e.message).join(', '),
        );
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
