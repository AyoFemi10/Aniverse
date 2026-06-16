/**
 * Download endpoint
 *
 * GET /api/v1/anime/:id/episodes/:episode/download?type=sub|dub
 *
 * Uses ffmpeg to mux the HLS stream into an MP4 and streams it
 * directly to the client as a download. The upstream CDN domain
 * is never exposed — ffmpeg runs server-side.
 *
 * Query params:
 *   type    sub | dub (default: sub)
 *   quality optional label shown in filename (e.g. "720p")
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

/** Sanitise a string for use as a filename */
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
          'Streams the episode through ffmpeg server-side and delivers it as an MP4 download. ' +
          'No upstream domain is exposed. Uses the same stream resolution as the `/streams` endpoint.',
        params: {
          type: 'object',
          required: ['id', 'episode'],
          properties: {
            id:      { type: 'string', description: 'Anime slug' },
            episode: { type: 'integer', minimum: 1, description: 'Episode number' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            type:    { type: 'string', enum: ['sub', 'dub'], default: 'sub' },
            quality: { type: 'string', description: 'Label for filename, e.g. 720p' },
            title:   { type: 'string', description: 'Anime title for filename' },
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
      const { type = 'sub', quality = '', title = '' } = request.query as {
        type?: string; quality?: string; title?: string;
      };

      // Resolve streams
      const { data: streams } = await aniwaveService.stream(id, String(episode));
      const stream = streams.find(s => s.type.toLowerCase() === type.toLowerCase())
        ?? streams[0];

      if (!stream) {
        return reply.status(404).send({
          success: false,
          error: { code: 'STREAM_NOT_FOUND', message: `No ${type.toUpperCase()} stream for ${id} episode ${episode}` },
        });
      }

      // Build filename:  Naruto_Episode_1_Sub_720p.mp4
      const animeName  = safeFilename(title || id.replace(/-\d+$/, '').replace(/-/g, ' '));
      const typeLabel  = type.toUpperCase();
      const qualLabel  = quality ? `_${quality}` : '';
      const filename   = `${animeName}_Episode_${episode}_${typeLabel}${qualLabel}.mp4`;

      logger.info({ id, episode, type, url: stream.url }, 'Download started');

      // Set response headers before spawning ffmpeg
      reply.raw.setHeader('Content-Type', 'video/mp4');
      reply.raw.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      reply.raw.setHeader('X-Powered-By', 'AniVerse');
      reply.raw.setHeader('Transfer-Encoding', 'chunked');

      // ffmpeg: read HLS, remux to MP4, write to stdout
      const ffmpeg = spawn('ffmpeg', [
        '-headers',    `Referer: https://aniwaves.ru\r\nOrigin: https://aniwaves.ru\r\n`,
        '-i',          stream.url,
        '-c',          'copy',          // no re-encode — just remux, fast
        '-movflags',   'frag_keyframe+empty_moov+faststart',  // streamable MP4
        '-f',          'mp4',
        'pipe:1',                       // output to stdout
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      // Pipe ffmpeg stdout → HTTP response
      ffmpeg.stdout.pipe(reply.raw);

      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        // ffmpeg progress goes to stderr — log at debug level only
        logger.debug({ msg: chunk.toString() }, 'ffmpeg stderr');
      });

      ffmpeg.on('error', (err) => {
        logger.error({ err }, 'ffmpeg spawn error');
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(502);
        }
        reply.raw.end();
      });

      ffmpeg.on('close', (code) => {
        logger.info({ id, episode, code }, 'Download complete');
        if (code !== 0 && !reply.raw.writableEnded) {
          reply.raw.end();
        }
      });

      // If the client disconnects, kill ffmpeg
      request.raw.on('close', () => {
        if (!ffmpeg.killed) ffmpeg.kill('SIGTERM');
      });

      // Return a hijacked reply — Fastify must not touch the response after this
      return reply;
    },
  );
};

export default downloadRoute;
