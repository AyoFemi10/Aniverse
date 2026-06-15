import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers';

vi.mock('../scrapers/aniwave.scraper', () => ({
  BRAND: 'AniVerse',
  scrapeSearch: vi.fn().mockResolvedValue([
    {
      id: 'naruto-123',
      title: 'Naruto',
      image: 'https://example.com/naruto.jpg',
      url: '/api/v1/anime/naruto-123',
    },
    {
      id: 'naruto-shippuden-456',
      title: 'Naruto Shippuden',
      image: 'https://example.com/shippuden.jpg',
      url: '/api/v1/anime/naruto-shippuden-456',
    },
  ]),
  scrapeDetails: vi.fn(),
  scrapeEpisodes: vi.fn(),
  scrapeStreams: vi.fn(),
  scrapeDiscovery: vi.fn().mockResolvedValue([]),
  scrapeGenres: vi.fn().mockResolvedValue([]),
  scrapeGenreAnime: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
  scrapeInfo: vi.fn(),
  hrefToId: vi.fn((href: string) => href),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/search', () => {
  it('returns 400 when query param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_PARAMS');
  });

  it('returns 400 when query is empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns results for valid query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=naruto' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      image: expect.any(String),
      url: expect.any(String),
    });
  });

  it('respects the limit param', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=naruto&limit=1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results.length).toBe(1);
  });

  it('returns total count', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=naruto' });
    const body = JSON.parse(res.body);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThan(0);
  });

  it('includes cached flag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=naruto' });
    const body = JSON.parse(res.body);
    expect(typeof body.cached).toBe('boolean');
  });
});
