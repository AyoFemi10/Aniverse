/**
 * M3U8 / HLS Stream Proxy
 *
 * GET /api/v1/stream-proxy?url=<base64url>&referer=<base64url>
 *
 * Fetches an M3U8 manifest or TS segment from the CDN server-side,
 * forwarding the required Referer header, then streams the bytes to the client.
 *
 * This is required because browsers block direct cross-origin M3U8 requests
 * that need custom headers (Referer). By proxying through this endpoint the
 * browser only talks to apis.ayohost.site — the upstream CDN is never exposed.
 *
 * Usage:
 *   1. Encode the stream url:     Buffer.from(url).toString('base64url')
 *   2. Encode the referer:        Buffer.from(referer).toString('base64url')
 *   3. Point HLS.js at:           /api/v1/stream-proxy?url=<enc>&referer=<enc>
 *
 * HLS.js xhrSetup example:
 *   xhrSetup(xhr, url) {
 *     xhr.open('GET', `/api/v1/stream-proxy?url=${btoa(url)}&referer=${btoa(referer)}`);
 *   }
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { logger } from '../utils/logger';

// Allowed CDN hostnames for stream proxying
const ALLOWED_STREAM_HOSTS = new Set([
  'aniwaves.ru',
  'play.echovideo.ru',
  'echovideo.ru',
]);

function isAllowedStreamHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return [...ALLOWED_STREAM_HOSTS].some(
      (h) => hostname === h || hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
} as const;

const streamProxyRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/stream-proxy',
    {
      schema: {
        tags: ['streams'],
        summary: 'M3U8 / HLS stream proxy',
        description:
          'Proxies an M3U8 manifest or TS segment through the server, forwarding ' +
          'the required Referer header. Use this when playing streams in a browser ' +
          'to avoid CORS/Referer blocking. ' +
          'Both `url` and `referer` params are base64url-encoded.',
        querystring: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'base64url-encoded stream URL (M3U8 or TS segment)' },
            referer: { type: 'string', description: 'base64url-encoded Referer value (optional)' },
          },
        },
        response: {
          200: { description: 'Stream bytes', type: 'string' },
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

      // Decode stream URL
      let streamUrl: string;
      try {
        streamUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8');
        new URL(streamUrl); // validate
      } catch {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'Invalid url param' },
        });
      }

      // Enforce allowlist
      if (!isAllowedStreamHost(streamUrl)) {
        logger.warn({ streamUrl }, 'Stream proxy: host not allowed');
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Stream host not permitted' },
        });
      }

      // Decode referer
      let referer = 'https://aniwaves.ru';
      if (encodedReferer) {
        try {
          referer = Buffer.from(encodedReferer, 'base64url').toString('utf8');
        } catch { /* use default */ }
      }

      try {
        const upstream = await axios.get<import('stream').Readable>(streamUrl, {
          responseType: 'stream',
          timeout: 20_000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Referer: referer,
            Origin: new URL(referer).origin,
            Accept: '*/*',
          },
          maxRedirects: 5,
        });

        const contentType = String(upstream.headers['content-type'] ?? 'application/vnd.apple.mpegurl');

        reply
          .header('Content-Type', contentType)
          .header('Access-Control-Allow-Origin', '*')
          .header('Access-Control-Allow-Headers', '*')
          .header('Cache-Control', 'no-cache'); // M3U8 manifests must not be cached

        const contentLength = upstream.headers['content-length'];
        if (contentLength) reply.header('Content-Length', String(contentLength));

        return reply.send(upstream.data);
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
