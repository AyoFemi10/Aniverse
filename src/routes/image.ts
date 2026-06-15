import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { decodeProxyUrl, isAllowedImageHost } from '../utils/image';
import { logger } from '../utils/logger';

// How long browsers / CDNs may cache the proxied image (1 week)
const IMAGE_CACHE_SECONDS = 60 * 60 * 24 * 7;

// Recognised image content-types we'll forward to the client
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

const imageRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/image',
    {
      schema: {
        tags: ['image'],
        summary: 'Proxied image',
        description:
          'Fetches and streams an upstream image through the AniVerse API. ' +
          'The `url` parameter is a base64url-encoded upstream image URL. ' +
          'Use the `image` fields returned by other endpoints — they are already encoded.',
        querystring: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {
              type: 'string',
              description: 'base64url-encoded upstream image URL',
            },
          },
        },
        response: {
          // Binary response – Swagger shows it as string (opaque binary)
          200: { description: 'Image bytes', type: 'string' },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
            },
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { url: encoded } = request.query as { url?: string };

      if (!encoded) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'url parameter is required' },
        });
      }

      // Decode the base64url token
      let rawUrl: string;
      try {
        rawUrl = decodeProxyUrl(encoded);
        // Ensure it's a valid absolute URL
        new URL(rawUrl);
      } catch {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'Invalid image url parameter' },
        });
      }

      // Enforce allowlist – never proxy arbitrary URLs
      if (!isAllowedImageHost(rawUrl)) {
        logger.warn({ rawUrl }, 'Image proxy: host not in allowlist');
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Image host not permitted' },
        });
      }

      // Fetch the image as a stream so we don't buffer the whole file in memory
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

        const contentType = upstream.headers['content-type'] ?? 'image/jpeg';

        // Only forward known image types
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
          // Vary on Accept so WebP-capable clients can get a different cache entry if needed
          .header('Vary', 'Accept');

        // Forward Content-Length when available so clients can show a progress bar
        const contentLength = upstream.headers['content-length'];
        if (contentLength) reply.header('Content-Length', contentLength);

        return reply.send(upstream.data);
      } catch (err) {
        logger.error({ err, rawUrl }, 'Image proxy: upstream fetch failed');
        return reply.status(502).send({
          success: false,
          error: { code: 'SCRAPER_ERROR', message: 'Failed to fetch image from upstream' },
        });
      }
    },
  );
};

export default imageRoute;
