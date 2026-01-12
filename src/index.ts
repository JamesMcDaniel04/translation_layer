import { createApp } from './app';
import { config, validateConfig } from './config';
import { initDatabase, closeDatabase } from './db';
import { initLanguageDetector } from './services/languageDetector';
import { initRedis, closeRedis } from './services/redis';
import { logger } from './services/logger';

async function main() {
  logger.info('Starting Translation Layer API...');

  // Validate configuration
  try {
    validateConfig();
    logger.info('Configuration validated');
  } catch (error) {
    logger.error({ err: error }, 'Configuration validation failed');
    process.exit(1);
  }

  // Initialize database
  try {
    await initDatabase();
    logger.info('Database connected');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to database');
    process.exit(1);
  }

  // Initialize Redis (optional - continues if unavailable)
  try {
    await initRedis();
  } catch (error) {
    logger.warn({ err: error }, 'Redis initialization failed - running without Redis');
  }

  // Initialize language detector (optional - continues if unavailable)
  try {
    await initLanguageDetector();
    logger.info('Language detector initialized');
  } catch (error) {
    logger.warn({ err: error }, 'Language detector initialization failed - detection unavailable');
  }

  // Create and start Express app
  const app = createApp();

  const server = app.listen(config.server.port, () => {
    logger.info(
      {
        port: config.server.port,
        env: config.server.env,
        features: {
          rateLimit: config.rateLimit.enabled,
          cache: config.cache.enabled,
          circuitBreaker: config.circuitBreaker.enabled,
          metrics: config.metrics.enabled,
          redis: config.redis.enabled,
        },
      },
      `Server running on port ${config.server.port}`
    );
  });

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error({ port: config.server.port }, 'Port already in use');
      process.exit(1);
    }
    throw error;
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');

      // Close Redis connection
      try {
        await closeRedis();
        logger.info('Redis connection closed');
      } catch (error) {
        logger.error({ err: error }, 'Error closing Redis');
      }

      // Close database connection
      try {
        await closeDatabase();
        logger.info('Database connection closed');
      } catch (error) {
        logger.error({ err: error }, 'Error closing database');
      }

      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force exit after 15 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled promise rejection');
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Fatal error during startup');
  process.exit(1);
});
