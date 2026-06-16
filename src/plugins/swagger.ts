import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'AniVerse API',
        description:
          'The **AniVerse** anime streaming API. ' +
          'Search anime, browse genres, fetch episode lists, and resolve M3U8 stream URLs ' +
          'for both SUB and DUB content. Every stream response is branded with the AniVerse provider label.',
        version: '1.0.0',
        contact: {
          name: 'AniVerse',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        { url: 'http://localhost:5000', description: 'Local development' },
      ],
      tags: [
        { name: 'search',    description: 'Search anime by keyword' },
        { name: 'anime',     description: 'Anime details & episodes' },
        { name: 'streams',   description: 'Stream URL resolution (SUB / DUB)' },
        { name: 'discovery', description: 'Trending, Recent, Popular, Newest, Added, Completed, Latest Episodes, Top, Schedule, A-Z' },
        { name: 'genres',    description: 'Genre list & genre browsing' },
        { name: 'image',     description: 'Proxied image delivery' },
        { name: 'health',    description: 'Health & monitoring' },
      ],
      components: {
        schemas: {
          ErrorResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'ANIME_NOT_FOUND' },
                  message: { type: 'string', example: 'Anime not found' },
                },
                required: ['code', 'message'],
              },
            },
            required: ['success', 'error'],
          },
        },
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      // Show "AniVerse API" in the browser tab / page heading
      displayRequestDuration: true,
    },
    // Custom Swagger UI theme to reinforce AniVerse branding
    theme: {
      title: 'AniVerse API Docs',
      css: [
        {
          filename: 'theme.css',
          content: `
            body { font-family: 'Segoe UI', sans-serif; }
            .swagger-ui .topbar { background: #1a1a2e; }
            .swagger-ui .topbar .download-url-wrapper { display: none; }
            .swagger-ui .topbar::before {
              content: '⚡ AniVerse';
              color: #e94560;
              font-size: 1.4rem;
              font-weight: 700;
              letter-spacing: 1px;
              padding: 0 1.5rem;
              line-height: 60px;
            }
            .swagger-ui .info .title { color: #e94560; }
          `,
        },
      ],
    },
    staticCSP: true,
  });
};

export default fp(swaggerPlugin, { name: 'swagger' });
