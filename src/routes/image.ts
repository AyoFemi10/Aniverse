import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { decodeProxyUrl, isAllowedImageHost } from '../utils/image';
import { logger } from '../utils/logger';

// 1-week browser / CDN cache for proxied images
const IMAGE_CACHE_SECONDS = 60 * 60 * 24 * 7;

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const;

const imageRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /proxy/:token
   *
   * Streams a proxied upstream image. The token is a base64url-encoded upstream URL.
   * All image fields returned by the API already contain the correct proxy URL —
   * clients never need to construct this manually.
   *
   * Example full URL:
   *   https://apis.ayohost.site/proxy/aHR0cHM6Ly9jZG4uYW5pd2F2ZXMucnUvaW1hZ2VzL25hcnV0by5qcGc=
   */
  fastify.get(
    '/:token',
    {
      schema: {
        tags: ['image'],
        summary: 'Proxied image',
        description:
          'Fetches and streams an upstream anime image. ' +
          'The `:token` segment is a base64url-encoded upstream image URL. ' +
          'Every `image` field in API responses already contains the full proxy URL — ' +
          'just use it directly in an `<img src>` tag.',
        params: {
          type: 'object',
          required: ['token'],
          properties: {
            token: {
              type: 'string',
              description: 'base64url-encoded upstream image URL',
            },
          },
        },
        response: {
          200: { description: 'Image bytes', type: 'string' },
          400: errorSchema,
          403: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };

      // Decode token → raw upstream URL
      let rawUrl: string;
      try {
        rawUrl = decodeProxyUrl(token);
        new URL(rawUrl); // throws if not a valid absolute URL
      } catch {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'Invalid proxy token' },
        });
      }

      // Enforce allowlist
      if (!isAllowedImageHost(rawUrl)) {
        logger.warn({ rawUrl }, 'Image proxy: host not in allowlist');
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Image host not permitted' },
        });
      }

      // Stream the image from upstream
      try {
        const upstream = await axios.get<import('stream').Readable>(rawUrl, {
          responseType: 'stream',
          timeout: 10_000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          maxRedirects: 5,
        });

        const contentType = String(upstream.headers['content-type'] ?? 'image/jpeg');
        const baseType = contentType.split(';')[0].trim();

        if (!ALLOWED_CONTENT_TYPES.has(baseType)) {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_PARAMS', message: 'Upstream resource is not an image' },
          });
        }

        reply
          .header('Content-Type', contentType)
          .header('Cache-Control', `public, max-age=${IMAGE_CACHE_SECONDS}, immutable`)
          .header('X-Powered-By', 'AniVerse')
          .header('Vary', 'Accept');

        const contentLength = upstream.headers['content-length'];
        if (contentLength) reply.header('Content-Length', String(contentLength));

        return reply.send(upstream.data);
      } catch (err) {
        logger.error({ err, rawUrl }, 'Image proxy: upstream fetch failed');
        return reply.status(502).send({
          success: false,
          error: { code: 'SCRAPER_ERROR', message: 'Failed to fetch upstream image' },
        });
      }
    },
  );
};

export default imageRoute;
