import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers';

vi.mock('../scrapers/aniwave.scraper', () => {
  const mockGenres = [
    { id: 'action',  name: 'Action',  url: '/api/v1/genres/action' },
    { id: 'romance', name: 'Romance', url: '/api/v1/genres/romance' },
    { id: 'fantasy', name: 'Fantasy', url: '/api/v1/genres/fantasy' },
  ];

  const mockGenreAnime = {
    items: [
      {
        id: 'naruto-123',
        title: 'Naruto',
        image: 'https://example.com/naruto.jpg',
        url: '/api/v1/anime/naruto-123',
        episodes: 220,
        type: 'TV',
      },
    ],
    hasNextPage: true,
  };

  return {
    BRAND: 'AniVerse',
    scrapeSearch: vi.fn().mockResolvedValue([]),
    scrapeDetails: vi.fn().mockResolvedValue(null),
    scrapeEpisodes: vi.fn().mockResolvedValue([]),
    scrapeStreams: vi.fn().mockResolvedValue([]),
    scrapeDiscovery: vi.fn().mockResolvedValue([]),
    scrapeGenres: vi.fn().mockResolvedValue(mockGenres),
    scrapeGenreAnime: vi.fn().mockResolvedValue(mockGenreAnime),
    scrapeInfo: vi.fn().mockResolvedValue(null),
    scrapeLatestEpisodes: vi.fn().mockResolvedValue([]),
  scrapeTopAnime: vi.fn().mockResolvedValue([]),
  scrapeSchedule: vi.fn().mockResolvedValue([]),
  scrapeAzList: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),  hrefToId: vi.fn((href: string) => href),
  };
});

const GENRE_COUNT = 3;

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

// ─── Genre List ───────────────────────────────────────────────────────────────

describe('GET /api/v1/genres', () => {
  it('returns 200 with genre list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.genres)).toBe(true);
    expect(body.genres.length).toBeGreaterThan(0);
  });

  it('each genre has id, name and url', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres' });
    const body = JSON.parse(res.body);
    for (const genre of body.genres) {
      expect(genre).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        url: expect.any(String),
      });
    }
  });

  it('returns correct total count', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres' });
    const body = JSON.parse(res.body);
    expect(body.total).toBe(GENRE_COUNT);
  });

  it('includes cached flag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres' });
    const body = JSON.parse(res.body);
    expect(typeof body.cached).toBe('boolean');
  });
});

// ─── Genre Browse ─────────────────────────────────────────────────────────────

describe('GET /api/v1/genres/:genre', () => {
  it('returns anime for a valid genre', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres/action' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.genre).toBe('action');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('includes pagination info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres/action?page=1' });
    const body = JSON.parse(res.body);
    expect(typeof body.page).toBe('number');
    expect(typeof body.hasNextPage).toBe('boolean');
  });

  it('item shape is correct', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres/action' });
    const body = JSON.parse(res.body);
    expect(body.items[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      image: expect.any(String),
      url: expect.any(String),
    });
  });

  it('returns 400 for invalid genre slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres/action%21%40%23' });
    expect([400, 404]).toContain(res.statusCode);
  });
});
