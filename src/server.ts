import 'dotenv/config';
import { buildApp } from './app';
import { logger } from './utils/logger';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 5000);

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ host: HOST, port: PORT });
    logger.info(`Server running on http://${HOST}:${PORT}`);
    logger.info(`API docs available at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

main();
