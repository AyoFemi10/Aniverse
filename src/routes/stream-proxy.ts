/**
 * M3U8 / HLS Stream Proxy
 *
 * GET /api/v1/stream-proxy?url=<base64url>&referer=<base64url>
 *
 * Fetches M3U8 manifests and TS segments from the CDN server-side,
 * forwarding the required Referer header.
 *
 * For M3U8 manifests, rewrites all relative URIs to absolute proxy URLs
 * so HLS.js can follow the playlist chain correctly through this proxy.
 *
 * For TS segments (binary), streams bytes directly to the client.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { logger } from '../utils/logger';

const ALLOWED_CDN_BASES = [
  'aniwaves.ru',
  'echovideo.ru',
  'burntburst45.store',   // covers hlsxst1, hlsxst2, hlsx5cdn, etc.
];

function isAllowedStreamHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_CDN_BASES.some(
      (base) => hostname === base || hostname.endsWith(`.${base}`),
    );
  } catch {
    return false;
  }
}

function encodeB64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

/**
 * Rewrite a M3U8 manifest so every URI line (relative or absolute)
 * is replaced with a proxy URL pointing back through this endpoint.
 */
function rewriteM3u8(body: string, baseUrl: string, referer: string): string {
  const base = new URL(baseUrl);
  const lines = body.split('\n');

  return lines
    .map((line) => {
      const trimmed = line.trim();

      // Skip comments, tags, empty lines
      if (!trimmed || trimmed.startsWith('#')) return line;

      // Resolve relative URL against the manifest's base URL
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(trimmed, base).toString();
      } catch {
        return line; // can't parse — leave as-is
      }

      // Wrap in the stream proxy
      const encUrl = encodeB64url(absoluteUrl);
      const encRef = encodeB64url(referer);
      return `/api/v1/stream-proxy?url=${encUrl}&referer=${encRef}`;
    })
    .join('\n');
}

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
} as const;

const streamProxyRoute: FastifyPluginAsync = async (fastify) => {
  // CORS preflight
  fastify.options('/stream-proxy', async (_req, reply) => {
    return reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .header('Access-Control-Allow-Headers', '*')
      .status(204)
      .send();
  });

  fastify.get(
    '/stream-proxy',
    {
      schema: {
        tags: ['streams'],
        summary: 'HLS stream proxy (M3U8 + segments)',
        description:
          'Proxies M3U8 manifests and TS segments through the server. ' +
          'Rewrites relative M3U8 URIs to absolute proxy paths so HLS.js ' +
          'can follow the full playlist chain. ' +
          '`url` and `referer` are base64url-encoded.',
        querystring: {
          type: 'object',
          required: ['url'],
          properties: {
            url:     { type: 'string', description: 'base64url-encoded stream URL' },
            referer: { type: 'string', description: 'base64url-encoded Referer (optional)' },
          },
        },
        response: {
          200: { description: 'Stream bytes or rewritten M3U8', type: 'string' },
          400: errorSchema,
          403: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { url: encodedUrl, referer: encodedReferer } = request.query as {
        url?: string;
        referer?: string;
      };

      if (!encodedUrl) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'url param is required' },
        });
      }

      let streamUrl: string;
      try {
        streamUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8');
        new URL(streamUrl);
      } catch {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'Invalid url param' },
        });
      }

      if (!isAllowedStreamHost(streamUrl)) {
        logger.warn({ streamUrl }, 'Stream proxy: host not allowed');
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Stream host not permitted' },
        });
      }

      let referer = 'https://aniwaves.ru';  // CDN requires this — never exposed to clients
      if (encodedReferer) {
        try {
          const decoded = Buffer.from(encodedReferer, 'base64url').toString('utf8');
          // Only use decoded referer if it's a known CDN origin, otherwise use default
          if (decoded.includes('aniwaves') || decoded.includes('burntburst') || decoded.includes('echovideo')) {
            referer = decoded;
          }
        } catch { /* use default */ }
      }

      const isM3u8 = streamUrl.includes('.m3u8') ||
        streamUrl.includes('master') ||
        streamUrl.includes('index');

      try {
        if (isM3u8) {
          // Fetch as text so we can rewrite relative URIs
          const upstream = await axios.get<string>(streamUrl, {
            responseType: 'text',
            timeout: 20_000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              Referer: 'https://aniwaves.ru',
              Origin: 'https://aniwaves.ru',
              Accept: '*/*',
            },
            maxRedirects: 5,
          });

          const rewritten = rewriteM3u8(upstream.data, streamUrl, referer);

          return reply
            .header('Content-Type', 'application/vnd.apple.mpegurl')
            .header('Access-Control-Allow-Origin', '*')
            .header('Cross-Origin-Resource-Policy', 'cross-origin')
            .header('Cache-Control', 'no-cache, no-store')
            .send(rewritten);
        } else {
          // Binary segment — stream directly
          const upstream = await axios.get<import('stream').Readable>(streamUrl, {
            responseType: 'stream',
            timeout: 30_000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              Referer: 'https://aniwaves.ru',
              Origin: 'https://aniwaves.ru',
              Accept: '*/*',
            },
            maxRedirects: 5,
          });

          const contentType = String(upstream.headers['content-type'] ?? 'video/mp2t');
          const contentLength = upstream.headers['content-length'];

          reply
            .header('Content-Type', contentType)
            .header('Access-Control-Allow-Origin', '*')
            .header('Cross-Origin-Resource-Policy', 'cross-origin')
            .header('Cache-Control', 'public, max-age=3600');

          if (contentLength) reply.header('Content-Length', String(contentLength));

          return reply.send(upstream.data);
        }
      } catch (err) {
        logger.error({ err, streamUrl }, 'Stream proxy: upstream fetch failed');
        return reply.status(502).send({
          success: false,
          error: { code: 'SCRAPER_ERROR', message: 'Failed to fetch stream from CDN' },
        });
      }
    },
  );
};

export default streamProxyRoute;
