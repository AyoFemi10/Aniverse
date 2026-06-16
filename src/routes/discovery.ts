import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
} as const;

const animeCardSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    image: { type: 'string' },
    url: { type: 'string' },
    latestEp: { type: 'integer' },
    totalEps: { type: 'integer' },
    type: { type: 'string' },
    year: { type: 'string' },
    sub: { type: 'boolean' },
    dub: { type: 'boolean' },
  },
} as const;

const pageQuery = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1, description: 'Page number' },
  },
};

function listSchema(summary: string, description: string) {
  return {
    tags: ['discovery'],
    summary,
    description,
    querystring: pageQuery,
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          items: { type: 'array', items: animeCardSchema },
          cached: { type: 'boolean' },
        },
      },
      500: errorSchema,
    },
  };
}

const discoveryRoute: FastifyPluginAsync = async (fastify) => {
  // ── Existing 3 ──────────────────────────────────────────────────────────────

  fastify.get('/trending', { schema: listSchema('Trending anime', 'Top anime from the home page.') },
    async (_req, reply: FastifyReply) => {
      const { data: items, cached } = await aniwaveService.trending();
      return reply.send({ success: true, items, cached });
    });

  fastify.get('/recent', { schema: listSchema('Recently updated', 'Anime with recently added episodes (home page list).') },
    async (_req, reply: FastifyReply) => {
      const { data: items, cached } = await aniwaveService.recent();
      return reply.send({ success: true, items, cached });
    });

  fastify.get('/popular', { schema: listSchema('Most popular', 'Most-watched anime — paginated.') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page = 1 } = request.query as { page?: number };
      const { data: items, cached } = await aniwaveService.popular(Number(page));
      return reply.send({ success: true, items, cached });
    });

  // ── New endpoints confirmed from aniwaves.ru/home ────────────────────────────

  fastify.get('/newest', { schema: listSchema('New releases', 'Latest new-season releases from /newest.') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page = 1 } = request.query as { page?: number };
      const { data: items, cached } = await aniwaveService.newest(Number(page));
      return reply.send({ success: true, items, cached });
    });

  fastify.get('/added', { schema: listSchema('Newly added', 'Anime newly added to the catalog from /added.') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page = 1 } = request.query as { page?: number };
      const { data: items, cached } = await aniwaveService.added(Number(page));
      return reply.send({ success: true, items, cached });
    });

  fastify.get('/completed', { schema: listSchema('Just completed', 'Anime that just finished airing from /completed.') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page = 1 } = request.query as { page?: number };
      const { data: items, cached } = await aniwaveService.completed(Number(page));
      return reply.send({ success: true, items, cached });
    });

  // ── Latest Episodes (home page tabbed list) ──────────────────────────────────

  fastify.get('/latest-episodes', {
    schema: {
      tags: ['discovery'],
      summary: 'Latest episodes',
      description: 'Most recently updated episode list from the home page. Filter by sub/dub/chinese/all.',
      querystring: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['all', 'sub', 'dub', 'chinese'], default: 'all' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            filter: { type: 'string' },
            items: { type: 'array', items: animeCardSchema },
            cached: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { filter = 'all' } = request.query as { filter?: 'all' | 'sub' | 'dub' | 'chinese' };
    const { data: items, cached } = await aniwaveService.latestEpisodes(filter);
    return reply.send({ success: true, filter, items, cached });
  });

  // ── Top Anime (day / week / month) ───────────────────────────────────────────

  fastify.get('/top-anime', {
    schema: {
      tags: ['discovery'],
      summary: 'Top anime',
      description: 'Ranked top anime by period: day, week, or month.',
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            period: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rank: { type: 'integer' },
                  id: { type: 'string' },
                  title: { type: 'string' },
                  image: { type: 'string' },
                  url: { type: 'string' },
                  latestEp: { type: 'integer' },
                  totalEps: { type: 'integer' },
                  type: { type: 'string' },
                },
              },
            },
            cached: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { period = 'day' } = request.query as { period?: 'day' | 'week' | 'month' };
    const { data: items, cached } = await aniwaveService.topAnime(period);
    return reply.send({ success: true, period, items, cached });
  });

  // ── Schedule ─────────────────────────────────────────────────────────────────

  fastify.get('/schedule', {
    schema: {
      tags: ['discovery'],
      summary: 'Airing schedule',
      description: 'Estimated episode airing schedule scraped from the home page.',
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
                  date: { type: 'string' },
                  entries: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        time: { type: 'string' },
                        episode: { type: 'integer' },
                        title: { type: 'string' },
                        id: { type: 'string' },
                        url: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            cached: { type: 'boolean' },
          },
        },
      },
    },
  }, async (_req, reply: FastifyReply) => {
    const { data: schedule, cached } = await aniwaveService.schedule();
    return reply.send({ success: true, schedule, cached });
  });

  // ── A-Z List ─────────────────────────────────────────────────────────────────

  fastify.get('/az-list/:letter', {
    schema: {
      tags: ['discovery'],
      summary: 'A-Z anime list',
      description: 'Browse all anime alphabetically. Use letters A-Z, "0-9" for numbers, or "#" for other.',
      params: {
        type: 'object',
        required: ['letter'],
        properties: {
          letter: { type: 'string', description: 'Letter (A-Z), "0-9", or "#"' },
        },
      },
      querystring: pageQuery,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            letter: { type: 'string' },
            page: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            items: { type: 'array', items: animeCardSchema },
            cached: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { letter } = request.params as { letter: string };
    const { page = 1 } = request.query as { page?: number };
    const { data, cached } = await aniwaveService.azList(letter, Number(page));
    return reply.send({ success: true, letter, page: Number(page), hasNextPage: data.hasNextPage, items: data.items, cached });
  });
};

export default discoveryRoute;
