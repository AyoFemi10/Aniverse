import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers';

const mockDetails = {
  title: 'Naruto',
  description: 'A young ninja who seeks recognition from his peers.',
  aliases: 'NARUTO',
  aired: '2002-10-03',
  image: 'https://example.com/naruto.jpg',
  genres: ['Action', 'Adventure'],
  status: 'Finished Airing',
  rating: '8.1',
};

const mockEpisodes = Array.from({ length: 220 }, (_, i) => ({
  number: i + 1,
  url: `https://aniwaves.ru/watch/naruto-123/episode/${i + 1}`,
}));

vi.mock('../scrapers/aniwave.scraper', () => ({
  BRAND: 'AniVerse',
  scrapeSearch: vi.fn().mockResolvedValue([]),
  scrapeDetails: vi.fn().mockResolvedValue(mockDetails),
  scrapeEpisodes: vi.fn().mockResolvedValue(mockEpisodes),
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

// ─── Details ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/anime/:id', () => {
  it('returns anime details for valid id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.anime).toMatchObject({
      title: expect.any(String),
      description: expect.any(String),
      aliases: expect.any(String),
      aired: expect.any(String),
    });
  });

  it('returns 400 for invalid id with special chars', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/anime/../../etc/passwd',
    });
    // Path traversal should result in 404 or 400
    expect([400, 404]).toContain(res.statusCode);
  });

  it('includes cached flag in response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123' });
    const body = JSON.parse(res.body);
    expect(typeof body.cached).toBe('boolean');
  });
});

// ─── Episodes ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/anime/:id/episodes', () => {
  it('returns episode list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/anime/naruto-123/episodes',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.episodes)).toBe(true);
    expect(body.episodes.length).toBeGreaterThan(0);
    expect(body.episodes[0]).toMatchObject({
      number: expect.any(Number),
      url: expect.any(String),
    });
  });

  it('returns total count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/anime/naruto-123/episodes',
    });
    const body = JSON.parse(res.body);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBe(mockEpisodes.length);
  });

  it('episode numbers are sequential from 1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/anime/naruto-123/episodes',
    });
    const body = JSON.parse(res.body);
    expect(body.episodes[0].number).toBe(1);
    expect(body.episodes[1].number).toBe(2);
  });
});
