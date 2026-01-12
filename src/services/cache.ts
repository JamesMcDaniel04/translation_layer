import crypto from 'crypto';
import { getRedisClient, isRedisAvailable } from './redis';
import { config } from '../config';
import { logger } from './logger';

// In-memory cache as fallback when Redis is unavailable
const memoryCache = new Map<string, { value: string; expiry: number }>();
let memoryCacheSize = 0;

interface CacheOptions {
  ttlSeconds?: number;
  namespace?: string;
}

function generateCacheKey(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: string,
  namespace = 'translation'
): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${text}:${sourceLang}:${targetLang}:${provider}`)
    .digest('hex')
    .substring(0, 32);
  return `${namespace}:${hash}`;
}

function cleanupMemoryCache(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiry < now) {
      memoryCache.delete(key);
      memoryCacheSize--;
    }
  }
}

export async function getCachedTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: string
): Promise<string | null> {
  if (!config.cache.enabled) return null;

  const key = generateCacheKey(text, sourceLang, targetLang, provider);

  // Try Redis first
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      const cached = await redis?.get(key);
      if (cached) {
        logger.debug({ key, provider }, 'Cache hit (Redis)');
        return cached;
      }
    } catch (error) {
      logger.warn({ err: error }, 'Redis cache get failed, falling back to memory');
    }
  }

  // Fall back to memory cache
  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.expiry > Date.now()) {
    logger.debug({ key, provider }, 'Cache hit (memory)');
    return memEntry.value;
  }

  logger.debug({ key, provider }, 'Cache miss');
  return null;
}

export async function setCachedTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: string,
  translatedText: string,
  options: CacheOptions = {}
): Promise<void> {
  if (!config.cache.enabled) return;

  const key = generateCacheKey(text, sourceLang, targetLang, provider, options.namespace);
  const ttl = options.ttlSeconds ?? config.cache.ttlSeconds;

  // Try Redis first
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      await redis?.setex(key, ttl, translatedText);
      logger.debug({ key, ttl, provider }, 'Cached translation (Redis)');
      return;
    } catch (error) {
      logger.warn({ err: error }, 'Redis cache set failed, falling back to memory');
    }
  }

  // Fall back to memory cache
  if (memoryCacheSize >= config.cache.maxSize) {
    cleanupMemoryCache();
    // If still at capacity, evict oldest entries
    if (memoryCacheSize >= config.cache.maxSize) {
      const keysToDelete = Array.from(memoryCache.keys()).slice(0, 100);
      keysToDelete.forEach((k) => memoryCache.delete(k));
      memoryCacheSize -= keysToDelete.length;
    }
  }

  memoryCache.set(key, {
    value: translatedText,
    expiry: Date.now() + ttl * 1000,
  });
  memoryCacheSize++;
  logger.debug({ key, ttl, provider }, 'Cached translation (memory)');
}

export async function invalidateCache(pattern: string): Promise<number> {
  let count = 0;

  // Invalidate Redis cache
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      const keys = await redis?.keys(`${config.redis.keyPrefix}${pattern}*`);
      if (keys && keys.length > 0) {
        await redis?.del(...keys);
        count += keys.length;
      }
    } catch (error) {
      logger.warn({ err: error }, 'Redis cache invalidation failed');
    }
  }

  // Invalidate memory cache
  for (const key of memoryCache.keys()) {
    if (key.startsWith(pattern)) {
      memoryCache.delete(key);
      count++;
    }
  }

  logger.info({ pattern, count }, 'Cache invalidated');
  return count;
}

export function getCacheStats(): {
  memorySize: number;
  maxSize: number;
  redisAvailable: boolean;
} {
  return {
    memorySize: memoryCacheSize,
    maxSize: config.cache.maxSize,
    redisAvailable: isRedisAvailable(),
  };
}

// Language detection cache (shorter TTL, different namespace)
export async function getCachedLanguageDetection(
  text: string
): Promise<{ lang: string; confidence: number } | null> {
  if (!config.cache.enabled) return null;

  const hash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 32);
  const key = `langdetect:${hash}`;

  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      const cached = await redis?.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Redis lang detection cache get failed');
    }
  }

  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.expiry > Date.now()) {
    return JSON.parse(memEntry.value);
  }

  return null;
}

export async function setCachedLanguageDetection(
  text: string,
  result: { lang: string; confidence: number }
): Promise<void> {
  if (!config.cache.enabled) return;

  const hash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 32);
  const key = `langdetect:${hash}`;
  const value = JSON.stringify(result);
  const ttl = 86400; // 24 hours for language detection

  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      await redis?.setex(key, ttl, value);
      return;
    } catch (error) {
      logger.warn({ err: error }, 'Redis lang detection cache set failed');
    }
  }

  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttl * 1000,
  });
}
