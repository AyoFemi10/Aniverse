import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { aniwaveService } from '../services/aniwave.service';
import { SearchQuerySchema } from '../schemas/search.schema';
import { ValidationError } from '../utils/errors';

const searchRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/search',
    {
      schema: {
        tags: ['search'],
        summary: 'Search anime by keyword',
        description: 'Returns a list of anime matching the search query.',
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
              description: 'Search keyword',
              example: 'naruto',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
              description: 'Max results to return',
            },
          },
        },
        response: {
          200: {
            description: 'Successful search',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    image: { type: 'string' },
                    url: { type: 'string' },
                  },
                },
              },
              total: { type: 'integer' },
              cached: { type: 'boolean' },
            },
          },
          400: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
      }

      const { q, limit = 50 } = parsed.data;
      const { data: results, cached } = await aniwaveService.search(q);

      const limited = limit ? results.slice(0, limit) : results;

      return reply.send({
        success: true,
        results: limited,
        total: limited.length,
        cached,
      });
    },
  );
};

export default searchRoute;
