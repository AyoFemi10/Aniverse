/**
 * Download endpoint
 *
 * GET /api/v1/anime/:id/episodes/:episode/download
 *
 * Query params:
 *   type        sub | dub (default: sub)
 *   quality     label for filename, e.g. "720p"
 *   title       anime title for filename
 *   variantUrl  base64url-encoded URL of a specific quality variant playlist
 *               (from the /qualities endpoint). If omitted, uses the master M3U8
 *               which lets ffmpeg pick the best available quality.
 *
 * Uses ffmpeg server-side to mux HLS → MP4 and streams it as a download.
 * The upstream CDN domain is never exposed to the client.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { spawn } from 'child_process';
import { aniwaveService } from '../services/aniwave.service';
import { logger } from '../utils/logger';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
} as const;

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9 _\-().]/gi, '').trim().replace(/\s+/g, '_') || 'episode';
}

const downloadRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:id/episodes/:episode/download',
    {
      schema: {
        tags: ['streams'],
        summary: 'Download episode as MP4',
        description:
          'Streams the episode through ffmpeg and delivers it as an MP4 download. ' +
          'Pass `variantUrl` (from the `/qualities` endpoint) to download a specific quality. ' +
          'Without `variantUrl`, downloads the default quality.',
        params: {
          type: 'object',
          required: ['id', 'episode'],
          properties: {
            id:      { type: 'string' },
            episode: { type: 'integer', minimum: 1 },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            type:       { type: 'string', enum: ['sub', 'dub'], default: 'sub' },
            quality:    { type: 'string', description: 'Quality label for filename, e.g. 720p' },
            title:      { type: 'string', description: 'Anime title for filename' },
            variantUrl: { type: 'string', description: 'base64url-encoded variant playlist URL from /qualities' },
          },
        },
        response: {
          200: { description: 'MP4 video stream', type: 'string' },
          404: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, episode } = request.params as { id: string; episode: number };
      const {
        type = 'sub',
        quality = '',
        title = '',
        variantUrl: encodedVariantUrl,
      } = request.query as { type?: string; quality?: string; title?: string; variantUrl?: string };

      let m3u8Url: string;

      if (encodedVariantUrl) {
        // Use the specific quality variant URL provided by the /qualities endpoint
        try {
          m3u8Url = Buffer.from(encodedVariantUrl, 'base64url').toString('utf8');
          new URL(m3u8Url); // validate
        } catch {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_PARAMS', message: 'Invalid variantUrl' },
          });
        }
      } else {
        // Fall back to the master M3U8 — ffmpeg will pick best quality
        const { data: streams } = await aniwaveService.stream(id, String(episode));
        const stream = streams.find(s => s.type.toLowerCase() === type.toLowerCase()) ?? streams[0];
        if (!stream) {
          return reply.status(404).send({
            success: false,
            error: { code: 'STREAM_NOT_FOUND', message: `No ${type.toUpperCase()} stream for ${id} episode ${episode}` },
          });
        }
        m3u8Url = stream.url;
      }

      // Build filename: Naruto_Episode_1_SUB_720p.mp4
      const animeName  = safeFilename(title || id.replace(/-\d+$/, '').replace(/-/g, ' '));
      const typeLabel  = type.toUpperCase();
      const qualLabel  = quality ? `_${quality}` : '';
      const filename   = `${animeName}_Episode_${episode}_${typeLabel}${qualLabel}.mp4`;

      logger.info({ id, episode, type, quality, m3u8Url }, 'Download started');

      reply.raw.setHeader('Content-Type', 'video/mp4');
      reply.raw.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      reply.raw.setHeader('X-Powered-By', 'AniVerse');
      reply.raw.setHeader('Transfer-Encoding', 'chunked');

      // ffmpeg: read HLS with required headers, remux to streamable MP4
      const ffmpeg = spawn('ffmpeg', [
        '-headers',  'Referer: https://aniwaves.ru\r\nOrigin: https://aniwaves.ru\r\n',
        '-i',        m3u8Url,
        '-c',        'copy',
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-f',        'mp4',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      ffmpeg.stdout.pipe(reply.raw);

      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        logger.debug({ msg: chunk.toString().slice(0, 200) }, 'ffmpeg');
      });

      ffmpeg.on('error', (err) => {
        logger.error({ err }, 'ffmpeg spawn error');
        if (!reply.raw.headersSent) reply.raw.writeHead(502);
        reply.raw.end();
      });

      ffmpeg.on('close', (code) => {
        logger.info({ id, episode, code }, 'Download complete');
        if (!reply.raw.writableEnded) reply.raw.end();
      });

      request.raw.on('close', () => {
        if (!ffmpeg.killed) ffmpeg.kill('SIGTERM');
      });

      return reply;
    },
  );
};

export default downloadRoute;
