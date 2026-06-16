import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers';
import { proxyImageUrl, decodeProxyUrl, isAllowedImageHost } from '../utils/image';

vi.mock('../scrapers/aniwave.scraper', () => ({
  BRAND: 'AniVerse',
  scrapeSearch: vi.fn().mockResolvedValue([]),
  scrapeDetails: vi.fn().mockResolvedValue(null),
  scrapeEpisodes: vi.fn().mockResolvedValue([]),
  scrapeStreams: vi.fn().mockResolvedValue([]),
  scrapeDiscovery: vi.fn().mockResolvedValue([]),
  scrapeLatestEpisodes: vi.fn().mockResolvedValue([]),
  scrapeTopAnime: vi.fn().mockResolvedValue([]),
  scrapeSchedule: vi.fn().mockResolvedValue([]),
  scrapeAzList: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
  scrapeGenres: vi.fn().mockResolvedValue([]),
  scrapeGenreAnime: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
  scrapeInfo: vi.fn().mockResolvedValue(null),
  hrefToId: vi.fn((href: string) => href),
}));

// Mock axios so the image proxy test doesn't hit the real network
vi.mock('axios', async (importActual) => {
  const actual = await importActual<typeof import('axios')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn().mockResolvedValue({
        headers: { 'content-type': 'image/jpeg', 'content-length': '1234' },
        data: Buffer.from('fake-image-bytes'),
      }),
    },
  };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

// ─── Unit: image utility helpers ─────────────────────────────────────────────

describe('proxyImageUrl / decodeProxyUrl', () => {
  it('encodes an upstream URL into a /proxy/ path', () => {
    const raw = 'https://cdn.aniwaves.ru/images/naruto.jpg';
    const proxied = proxyImageUrl(raw);
    expect(proxied).toMatch(/\/api\/v1\/proxy\//);
    // Must not contain the upstream domain
    expect(proxied).not.toContain('aniwaves.ru');
  });

  it('round-trips correctly', () => {
    const raw = 'https://cdn.aniwaves.ru/images/naruto.jpg';
    const proxied = proxyImageUrl(raw);
    // token is the last path segment
    const token = proxied.split('/proxy/')[1];
    expect(decodeProxyUrl(token)).toBe(raw);
  });

  it('does not double-encode already-proxied URLs', () => {
    const raw = 'https://cdn.aniwaves.ru/images/naruto.jpg';
    const once = proxyImageUrl(raw);
    const twice = proxyImageUrl(once);
    expect(once).toBe(twice);
  });

  it('returns empty string for empty input', () => {
    expect(proxyImageUrl('')).toBe('');
  });
});

describe('isAllowedImageHost', () => {
  it('allows known CDN hosts', () => {
    expect(isAllowedImageHost('https://cdn.aniwaves.ru/img/a.jpg')).toBe(true);
    expect(isAllowedImageHost('https://aniwaves.ru/img/a.jpg')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedImageHost('https://evil.com/malware.exe')).toBe(false);
    expect(isAllowedImageHost('https://not-allowed.net/x.jpg')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedImageHost('not-a-url')).toBe(false);
  });
});

// ─── Route: GET /api/v1/image ─────────────────────────────────────────────────

describe('GET /proxy/:token', () => {
  it('returns 400 for a clearly invalid token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/proxy/!!!' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_PARAMS');
  });

  it('returns 403 for a disallowed host', async () => {
    const token = Buffer.from('https://evil.com/img.jpg').toString('base64url');
    const res = await app.inject({ method: 'GET', url: `/proxy/${token}` });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('returns 200 and image bytes for a valid allowed URL', async () => {
    const raw = 'https://cdn.aniwaves.ru/images/naruto.jpg';
    const token = Buffer.from(raw).toString('base64url');
    const res = await app.inject({ method: 'GET', url: `/proxy/${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image/);
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['x-powered-by']).toBe('AniVerse');
  });

  it('sets long immutable cache-control header', async () => {
    const raw = 'https://cdn.aniwaves.ru/images/naruto.jpg';
    const token = Buffer.from(raw).toString('base64url');
    const res = await app.inject({ method: 'GET', url: `/proxy/${token}` });
    expect(res.headers['cache-control']).toContain('immutable');
  });
});
