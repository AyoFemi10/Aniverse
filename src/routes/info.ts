import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';
import { AnimeParamsSchema } from '../schemas/anime.schema';
import { ValidationError } from '../utils/errors';

const infoRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/anime/:id/info
   *
   * A "super" endpoint that returns details + full episode list in one response.
   * Useful for building an anime detail page without making two round trips.
   * The underlying scrape is also a single HTTP fetch (one HTML page → two parsers).
   */
  fastify.get(
    '/:id/info',
    {
      schema: {
        tags: ['anime'],
        summary: 'Get full anime info (details + episodes)',
        description:
          'Returns a combined response with all anime metadata AND the complete ' +
          'episode list. Equivalent to calling `GET /anime/:id` and `GET /anime/:id/episodes` ' +
          'simultaneously, but resolved in a single upstream fetch.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              description: 'Anime slug (e.g. naruto-123)',
              example: 'naruto-123',
            },
          },
        },
        response: {
          200: {
            description: 'Full anime info',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              info: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  aliases: { type: 'string' },
                  aired: { type: 'string' },
                  image: { type: 'string' },
                  genres: { type: 'array', items: { type: 'string' } },
                  status: { type: 'string' },
                  rating: { type: 'string' },
                  totalEpisodes: { type: 'integer' },
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
                },
              },
              cached: { type: 'boolean' },
            },
          },
          404: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = AnimeParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
      }

      const { data: info, cached } = await aniwaveService.info(parsed.data.id);

      return reply.send({ success: true, info, cached });
    },
  );
};

export default infoRoute;
