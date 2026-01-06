import { createApp } from './app';
import { config } from './config';
import { initDatabase, closeDatabase } from './db';
import { initLanguageDetector } from './services/languageDetector';

async function main() {
  console.info('Starting Translation Layer API...');

  // Initialize database
  try {
    await initDatabase();
    console.info('Database connected');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }

  // Initialize language detector
  try {
    await initLanguageDetector();
    console.info('Language detector initialized');
  } catch (error) {
    console.error('Failed to initialize language detector:', error);
    console.warn('Language detection will be unavailable');
  }

  // Create and start Express app
  const app = createApp();

  const server = app.listen(config.server.port, () => {
    console.info(`Server running on port ${config.server.port}`);
    console.info(`Environment: ${config.server.env}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.info(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      console.info('HTTP server closed');

      try {
        await closeDatabase();
        console.info('Database connection closed');
      } catch (error) {
        console.error('Error closing database:', error);
      }

      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
