import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';
import { AnimeParamsSchema } from '../schemas/anime.schema';
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

const infoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:id/info',
    {
      schema: {
        tags: ['anime'],
        summary: 'Get full anime info (details + episodes)',
        description:
          'Combined response with all anime metadata AND the complete episode list. ' +
          'Single upstream fetch — more efficient than calling /anime/:id and /anime/:id/episodes separately.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Anime slug (e.g. naruto-123)' },
          },
        },
        response: {
          200: {
            description: 'Full anime info',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
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
          400: errorSchema,
          404: errorSchema,
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
