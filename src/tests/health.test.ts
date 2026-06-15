import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers';

vi.mock('../scrapers/aniwave.scraper', () => ({
  BRAND: 'AniVerse',
  scrapeSearch: vi.fn().mockResolvedValue([]),
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

describe('GET /health', () => {
  it('returns 200 with ok status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('includes uptime', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('includes redis status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(['ok', 'unavailable']).toContain(body.redis);
  });

  it('includes timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(typeof body.timestamp).toBe('string');
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});
