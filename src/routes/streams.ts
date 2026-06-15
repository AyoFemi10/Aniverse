import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { aniwaveService } from '../services/aniwave.service';
import { EpisodeParamsSchema } from '../schemas/anime.schema';
import { ValidationError, NotFoundError } from '../utils/errors';
import { BRAND } from '../scrapers/aniwave.scraper';

// Query param schema for stream type filtering
const StreamQuerySchema = z.object({
  type: z
    .enum(['sub', 'dub', 'all'], {
      errorMap: () => ({ message: 'type must be "sub", "dub", or "all"' }),
    })
    .default('all')
    .optional(),
});

const streamRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:id/episodes/:episode/streams',
    {
      schema: {
        tags: ['streams'],
        summary: 'Get stream URLs for an episode',
        description:
          'Resolves and returns M3U8 stream URLs for the requested episode. ' +
          'Use the `type` query param to select SUB only, DUB only, or both. ' +
          'Every stream includes a `provider` field branded as **AniVerse**.',
        params: {
          type: 'object',
          required: ['id', 'episode'],
          properties: {
            id: { type: 'string', description: 'Anime slug', example: 'naruto-123' },
            episode: {
              type: 'integer',
              minimum: 1,
              description: 'Episode number',
              example: 1,
            },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['sub', 'dub', 'all'],
              default: 'all',
              description: 'Filter streams by type. "sub" = subtitled, "dub" = dubbed, "all" = both.',
            },
          },
        },
        response: {
          200: {
            description: 'Stream sources',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              provider: { type: 'string', example: BRAND },
              streams: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['SUB', 'DUB'] },
                    url: { type: 'string' },
                    provider: { type: 'string', example: BRAND },
                    headers: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
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
      const paramsParsed = EpisodeParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(paramsParsed.error.errors.map((e) => e.message).join(', '));
      }

      const queryParsed = StreamQuerySchema.safeParse(request.query);
      const typeFilter = queryParsed.success ? (queryParsed.data.type ?? 'all') : 'all';

      const { id, episode } = paramsParsed.data;
      const { data: allStreams, cached } = await aniwaveService.stream(
        id,
        String(episode),
      );

      // Apply type filter
      const streams =
        typeFilter === 'all'
          ? allStreams
          : allStreams.filter((s) => s.type.toLowerCase() === typeFilter);

      if (streams.length === 0) {
        const detail =
          typeFilter === 'all'
            ? `No streams found for ${id} episode ${episode}`
            : `No ${typeFilter.toUpperCase()} stream found for ${id} episode ${episode}`;
        throw new NotFoundError('STREAM_NOT_FOUND', detail);
      }

      return reply.send({
        success: true,
        provider: BRAND,      // "AniVerse" top-level brand label
        streams,
        cached,
      });
    },
  );
};

export default streamRoute;
