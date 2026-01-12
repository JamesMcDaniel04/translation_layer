import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

let redisClient: Redis | null = null;

export async function initRedis(): Promise<Redis | null> {
  if (!config.redis.enabled) {
    logger.info('Redis is disabled, skipping initialization');
    return null;
  }

  try {
    redisClient = new Redis(config.redis.url, {
      keyPrefix: config.redis.keyPrefix,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis ready');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Redis');
    redisClient = null;
    return null;
  }
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

export function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.status === 'ready';
}
