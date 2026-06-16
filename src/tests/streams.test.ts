import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers';

const BRAND = 'AniVerse';

vi.mock('../scrapers/aniwave.scraper', () => {
  const mockStreams = [
    {
      type: 'SUB' as const,
      url: 'https://cdn.example.com/sub.m3u8',
      provider: 'AniVerse',
      headers: { Referer: 'https://cdn.example.com' },
    },
    {
      type: 'DUB' as const,
      url: 'https://cdn.example.com/dub.m3u8',
      provider: 'AniVerse',
      headers: { Referer: 'https://cdn.example.com' },
    },
  ];

  return {
    BRAND: 'AniVerse',
    scrapeSearch: vi.fn().mockResolvedValue([]),
    scrapeDetails: vi.fn().mockResolvedValue(null),
    scrapeEpisodes: vi.fn().mockResolvedValue([]),
    scrapeStreams: vi.fn().mockResolvedValue(mockStreams),
    scrapeDiscovery: vi.fn().mockResolvedValue([]),
    scrapeGenres: vi.fn().mockResolvedValue([]),
    scrapeGenreAnime: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
    scrapeInfo: vi.fn().mockResolvedValue(null),
    scrapeLatestEpisodes: vi.fn().mockResolvedValue([]),
  scrapeTopAnime: vi.fn().mockResolvedValue([]),
  scrapeSchedule: vi.fn().mockResolvedValue([]),
  scrapeAzList: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),  hrefToId: vi.fn((href: string) => href),
  };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/anime/:id/episodes/:episode/streams', () => {
  // ── Response shape ────────────────────────────────────────────────────────

  it('returns 200 with SUB and DUB streams', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.streams)).toBe(true);
    expect(body.streams.length).toBe(2);
  });

  it('top-level provider is AniVerse', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams' });
    const body = JSON.parse(res.body);
    expect(body.provider).toBe(BRAND);
  });

  it('each stream has provider = AniVerse', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams' });
    const body = JSON.parse(res.body);
    for (const stream of body.streams) {
      expect(stream.provider).toBe(BRAND);
    }
  });

  it('stream objects have correct shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams' });
    const body = JSON.parse(res.body);
    for (const stream of body.streams) {
      expect(stream).toMatchObject({
        type: expect.stringMatching(/^(SUB|DUB)$/),
        url: expect.any(String),
        provider: BRAND,
      });
    }
  });

  it('includes cached flag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams' });
    const body = JSON.parse(res.body);
    expect(typeof body.cached).toBe('boolean');
  });

  // ── ?type selector ────────────────────────────────────────────────────────

  it('?type=sub returns only SUB', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams?type=sub' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.streams.every((s: { type: string }) => s.type === 'SUB')).toBe(true);
    expect(body.streams.length).toBe(1);
  });

  it('?type=dub returns only DUB', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams?type=dub' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.streams.every((s: { type: string }) => s.type === 'DUB')).toBe(true);
    expect(body.streams.length).toBe(1);
  });

  it('?type=all returns both SUB and DUB', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams?type=all' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const types = body.streams.map((s: { type: string }) => s.type);
    expect(types).toContain('SUB');
    expect(types).toContain('DUB');
  });

  it('no ?type returns all streams by default', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams' });
    const body = JSON.parse(res.body);
    expect(body.streams.length).toBe(2);
  });

  it('?type=dub returns 404 when only SUB available', async () => {
    const { scrapeStreams } = await import('../scrapers/aniwave.scraper');
    vi.mocked(scrapeStreams).mockResolvedValueOnce([
      { type: 'SUB', url: 'https://cdn.example.com/sub.m3u8', provider: BRAND },
    ]);
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/1/streams?type=dub' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('STREAM_NOT_FOUND');
  });

  // ── Error cases ───────────────────────────────────────────────────────────

  it('returns 404 when no streams found', async () => {
    const { scrapeStreams } = await import('../scrapers/aniwave.scraper');
    vi.mocked(scrapeStreams).mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/999/streams' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('STREAM_NOT_FOUND');
  });

  it('returns 400 for non-numeric episode', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/anime/naruto-123/episodes/abc/streams' });
    expect(res.statusCode).toBe(400);
  });
});
