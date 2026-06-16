import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers';

// All mock data defined inside the factory to avoid hoisting issues
vi.mock('../scrapers/aniwave.scraper', () => {
  const mockInfo = {
    id: 'naruto-123',
    title: 'Naruto',
    description: 'A young ninja who seeks recognition from his peers.',
    aliases: 'NARUTO',
    aired: '2002-10-03',
    image: 'https://example.com/naruto.jpg',
    genres: ['Action', 'Adventure', 'Comedy'],
    status: 'Finished Airing',
    rating: '8.1',
    totalEpisodes: 220,
    episodes: Array.from({ length: 220 }, (_, i) => ({
      number: i + 1,
      url: `/api/v1/anime/naruto-123/episodes/${i + 1}/streams`,
    })),
  };

  return {
    BRAND: 'AniVerse',
    scrapeSearch: vi.fn().mockResolvedValue([]),
    scrapeDetails: vi.fn().mockResolvedValue(null),
    scrapeEpisodes: vi.fn().mockResolvedValue([]),
    scrapeStreams: vi.fn().mockResolvedValue([]),
    scrapeDiscovery: vi.fn().mockResolvedValue([]),
    scrapeGenres: vi.fn().mockResolvedValue([]),
    scrapeGenreAnime: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
    scrapeInfo: vi.fn().mockResolvedValue(mockInfo),
    scrapeLatestEpisodes: vi.fn().mockResolvedValue([]),
  scrapeTopAnime: vi.fn().mockResolvedValue([]),
  scrapeSchedule: vi.fn().mockResolvedValue([]),
  scrapeAzList: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),  hrefToId: vi.fn((href: string) => href),
  };
});

const TOTAL_EPISODES = 220;

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/anime/:id/info', () => {
  it('returns 200 with combined info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/info' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.info).toBeDefined();
  });

  it('contains all expected metadata fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/info' });
    const body = JSON.parse(res.body);
    expect(body.info).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      description: expect.any(String),
      aliases: expect.any(String),
      aired: expect.any(String),
      genres: expect.any(Array),
      status: expect.any(String),
      totalEpisodes: expect.any(Number),
    });
  });

  it('contains inline episode list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/info' });
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.info.episodes)).toBe(true);
    expect(body.info.episodes.length).toBe(TOTAL_EPISODES);
    expect(body.info.episodes[0]).toMatchObject({ number: 1, url: expect.any(String) });
  });

  it('totalEpisodes matches episodes array length', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/info' });
    const body = JSON.parse(res.body);
    expect(body.info.totalEpisodes).toBe(body.info.episodes.length);
  });

  it('includes cached flag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/info' });
    const body = JSON.parse(res.body);
    expect(typeof body.cached).toBe('boolean');
  });
});
