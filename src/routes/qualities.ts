/**
 * Quality levels endpoint
 *
 * GET /api/v1/anime/:id/episodes/:episode/qualities?type=sub|dub
 *
 * Returns the available quality levels for an episode by parsing
 * the master M3U8 playlist server-side.
 *
 * Response:
 * {
 *   "success": true,
 *   "qualities": [
 *     { "label": "1080p", "height": 1080, "bandwidth": 3000000, "url": "/api/v1/stream-proxy?url=..." },
 *     { "label": "720p",  "height": 720,  "bandwidth": 1200000, "url": "/api/v1/stream-proxy?url=..." },
 *     { "label": "480p",  "height": 480,  "bandwidth": 600000,  "url": "/api/v1/stream-proxy?url=..." },
 *     { "label": "360p",  "height": 360,  "bandwidth": 300000,  "url": "/api/v1/stream-proxy?url=..." }
 *   ]
 * }
 *
 * The `url` field in each quality is already a proxied stream-proxy URL ready
 * for HLS.js — the upstream CDN domain is never exposed.
 *
 * The `downloadUrl` field points to the download endpoint for that quality.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { aniwaveService } from '../services/aniwave.service';
import { parseM3u8Qualities } from '../utils/hls';
import { withCache, CACHE_KEYS, CACHE_TTL } from '../utils/cache';
import { logger } from '../utils/logger';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
} as const;

/** Encode to base64url (same as proxyImageUrl / stream-proxy uses) */
function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

const qualitiesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:id/episodes/:episode/qualities',
    {
      schema: {
        tags: ['streams'],
        summary: 'List available quality levels for an episode',
        description:
          'Parses the HLS master playlist and returns all available quality variants. ' +
          'Each quality includes a proxied stream URL and a direct download URL.',
        params: {
          type: 'object',
          required: ['id', 'episode'],
          properties: {
            id:      { type: 'string', description: 'Anime slug' },
            episode: { type: 'integer', minimum: 1 },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['sub', 'dub'], default: 'sub' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success:   { type: 'boolean' },
              type:      { type: 'string' },
              qualities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label:       { type: 'string', description: '"720p", "480p" etc.' },
                    height:      { type: 'integer' },
                    bandwidth:   { type: 'integer' },
                    streamUrl:   { type: 'string', description: 'Proxied HLS URL for playback' },
                    downloadUrl: { type: 'string', description: 'Direct download URL' },
                  },
                },
              },
              cached: { type: 'boolean' },
            },
          },
          404: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, episode } = request.params as { id: string; episode: number };
      const { type = 'sub' } = request.query as { type?: string };

      // Get the master stream URL
      const { data: streams } = await aniwaveService.stream(id, String(episode));
      const stream = streams.find(s => s.type.toLowerCase() === type.toLowerCase()) ?? streams[0];

      if (!stream) {
        return reply.status(404).send({
          success: false,
          error: { code: 'STREAM_NOT_FOUND', message: `No ${type.toUpperCase()} stream for ${id} episode ${episode}` },
        });
      }

      // Cache quality levels per stream URL (they rarely change)
      const cacheKey = `qualities:${b64url(stream.url)}`;
      const { data: levels, cached } = await withCache(
        cacheKey,
        CACHE_TTL.STREAMS,
        () => parseM3u8Qualities(stream.url),
      );

      if (levels.length === 0) {
        // No variants — single quality stream, return it as-is
        const singleLabel = '720p'; // default assumption
        return reply.send({
          success: true,
          type: type.toUpperCase(),
          qualities: [{
            label:       singleLabel,
            height:      720,
            bandwidth:   0,
            streamUrl:   `/api/v1/stream-proxy?url=${b64url(stream.url)}&referer=${b64url('https://apis.ayohost.site')}`,
            downloadUrl: `/api/v1/anime/${id}/episodes/${episode}/download?type=${type}&quality=${singleLabel}`,
          }],
          cached,
        });
      }

      const qualities = levels.map(level => ({
        label:       level.label,
        height:      level.height,
        bandwidth:   level.bandwidth,
        // Proxied stream URL — CDN domain never exposed to client
        streamUrl:   `/api/v1/stream-proxy?url=${b64url(level.url)}&referer=${b64url('https://apis.ayohost.site')}`,
        // Download URL passes the quality variant URL so ffmpeg fetches exactly that quality
        downloadUrl: `/api/v1/anime/${id}/episodes/${episode}/download?type=${type}&quality=${level.label}&variantUrl=${b64url(level.url)}`,
      }));

      return reply.send({ success: true, type: type.toUpperCase(), qualities, cached });
    },
  );
};

export default qualitiesRoute;
