/**
 * Home / Discovery routes
 *
 * GET /api/v1/trending
 * GET /api/v1/popular?page=
 * GET /api/v1/recent
 * GET /api/v1/newest?page=
 * GET /api/v1/added?page=
 * GET /api/v1/completed?page=
 * GET /api/v1/latest-episodes?filter=sub|dub|chinese|trending|random|all
 * GET /api/v1/top?period=day|week|month
 * GET /api/v1/schedule
 * GET /api/v1/az?letter=A&page=1
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
} as const;

const listResponseSchema = (description: string) => ({
  200: {
    description,
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' }, title: { type: 'string' }, image: { type: 'string' },
            url: { type: 'string' }, episodes: { type: 'integer' }, type: { type: 'string' },
          },
        },
      },
      page: { type: 'integer' },
      cached: { type: 'boolean' },
    },
  },
  500: errorSchema,
});

const pageQuery = {
  type: 'object',
  properties: { page: { type: 'integer', minimum: 1, default: 1 } },
};

const homeRoute: FastifyPluginAsync = async (fastify) => {
  // ── Trending ────────────────────────────────────────────────────────────────
  fastify.get('/trending', {
    schema: { tags: ['discovery'], summary: 'Trending anime', querystring: pageQuery, response: listResponseSchema('Trending anime') },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { data: items, cached } = await aniwaveService.trending();
    return reply.send({ success: true, items, page: 1, cached });
  });

  // ── Popular ─────────────────────────────────────────────────────────────────
  fastify.get('/popular', {
    schema: { tags: ['discovery'], summary: 'Most popular anime', querystring: pageQuery, response: listResponseSchema('Most popular') },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { page = 1 } = req.query as { page?: number };
    const { data: items, cached } = await aniwaveService.popular(Number(page));
    return reply.send({ success: true, items, page: Number(page), cached });
  });

  // ── Recent ──────────────────────────────────────────────────────────────────
  fastify.get('/recent', {
    schema: { tags: ['discovery'], summary: 'Recently updated anime', querystring: pageQuery, response: listResponseSchema('Recently updated') },
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const { data: items, cached } = await aniwaveService.recent();
    return reply.send({ success: true, items, page: 1, cached });
  });

  // ── Newest (new releases) ────────────────────────────────────────────────────
  fastify.get('/newest', {
    schema: { tags: ['discovery'], summary: 'New releases', description: 'Scrapes /newest', querystring: pageQuery, response: listResponseSchema('New releases') },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { page = 1 } = req.query as { page?: number };
    const { data: items, cached } = await aniwaveService.newest(Number(page));
    return reply.send({ success: true, items, page: Number(page), cached });
  });

  // ── Added (newly added) ──────────────────────────────────────────────────────
  fastify.get('/added', {
    schema: { tags: ['discovery'], summary: 'Newly added anime', description: 'Scrapes /added', querystring: pageQuery, response: listResponseSchema('Newly added') },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { page = 1 } = req.query as { page?: number };
    const { data: items, cached } = await aniwaveService.added(Number(page));
    return reply.send({ success: true, items, page: Number(page), cached });
  });

  // ── Completed ────────────────────────────────────────────────────────────────
  fastify.get('/completed', {
    schema: { tags: ['discovery'], summary: 'Just completed anime', description: 'Scrapes /completed', querystring: pageQuery, response: listResponseSchema('Just completed') },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { page = 1 } = req.query as { page?: number };
    const { data: items, cached } = await aniwaveService.completed(Number(page));
    return reply.send({ success: true, items, page: Number(page), cached });
  });

  // ── Latest Episodes ──────────────────────────────────────────────────────────
  fastify.get('/latest-episodes', {
    schema: {
      tags: ['discovery'],
      summary: 'Latest episodes (filterable by type)',
      description: 'Returns the latest episode updates. Filter with ?filter=sub|dub|chinese|trending|random|all',
      querystring: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['all', 'sub', 'dub', 'chinese', 'trending', 'random'], default: 'all' },
        },
      },
      response: listResponseSchema('Latest episodes'),
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { filter = 'all' } = req.query as { filter?: string };
    const validFilter = ['all', 'sub', 'dub', 'chinese', 'trending', 'random'].includes(filter)
      ? filter as 'all' | 'sub' | 'dub' | 'chinese' | 'trending' | 'random'
      : 'all' as const;
    const { data: items, cached } = await aniwaveService.latestEpisodes(validFilter);
    return reply.send({ success: true, filter: validFilter, items, cached });
  });

  // ── Top Anime ────────────────────────────────────────────────────────────────
  fastify.get('/top', {
    schema: {
      tags: ['discovery'],
      summary: 'Top anime by period',
      description: 'Returns top-rated anime for the given period. ?period=day|week|month',
      querystring: {
        type: 'object',
        properties: { period: { type: 'string', enum: ['day', 'week', 'month'], default: 'week' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }, period: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rank: { type: 'integer' }, id: { type: 'string' }, title: { type: 'string' },
                  image: { type: 'string' }, url: { type: 'string' }, score: { type: 'string' }, type: { type: 'string' },
                },
              },
            },
            cached: { type: 'boolean' },
          },
        },
        500: errorSchema,
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { period = 'week' } = req.query as { period?: string };
    const validPeriod = ['day', 'week', 'month'].includes(period) ? period as 'day' | 'week' | 'month' : 'week';
    const { data: items, cached } = await aniwaveService.topAnime(validPeriod);
    return reply.send({ success: true, period: validPeriod, items, cached });
  });

  // ── Schedule ─────────────────────────────────────────────────────────────────
  fastify.get('/schedule', {
    schema: {
      tags: ['discovery'],
      summary: 'Airing schedule (7 days)',
      description: 'Returns the upcoming airing schedule for the next 7 days.',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            schedule: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' }, date: { type: 'string' },
                  entries: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' }, title: { type: 'string' }, image: { type: 'string' },
                        url: { type: 'string' }, episode: { type: 'integer' }, airingAt: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            cached: { type: 'boolean' },
          },
        },
        500: errorSchema,
      },
    },
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const { data: schedule, cached } = await aniwaveService.schedule();
    return reply.send({ success: true, schedule, cached });
  });

  // ── A-Z List ─────────────────────────────────────────────────────────────────
  fastify.get('/az', {
    schema: {
      tags: ['discovery'],
      summary: 'A-Z anime list',
      description: 'Browse all anime alphabetically. Use ?letter=A (A-Z, 0-9, or # for other).',
      querystring: {
        type: 'object',
        required: ['letter'],
        properties: {
          letter: { type: 'string', description: 'Single letter A-Z, "0-9", or "#"' },
          page: { type: 'integer', minimum: 1, default: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }, letter: { type: 'string' }, page: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, image: { type: 'string' }, url: { type: 'string' } } } },
            cached: { type: 'boolean' },
          },
        },
        400: errorSchema,
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { letter, page = 1 } = req.query as { letter?: string; page?: number };
    if (!letter) return reply.status(400).send({ success: false, error: { code: 'INVALID_PARAMS', message: 'letter is required' } });
    const { data, cached } = await aniwaveService.azList(letter.toUpperCase(), Number(page));
    return reply.send({ success: true, letter: letter.toUpperCase(), page: Number(page), hasNextPage: data.hasNextPage, items: data.items, cached });
  });
};

export default homeRoute;
