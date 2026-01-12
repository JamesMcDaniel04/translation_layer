import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request, Response } from 'express';
import { config } from '../config';
import { getRedisClient, isRedisAvailable } from '../services/redis';
import { logger } from '../services/logger';

// Custom key generator that uses tenant ID if available, otherwise IP
function keyGenerator(req: Request): string {
  const tenantId = req.tenant?.id;
  if (tenantId) {
    return `tenant:${tenantId}`;
  }
  // Fall back to IP-based limiting
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

// Rate limit exceeded handler
function rateLimitHandler(req: Request, res: Response): void {
  const tenantId = req.tenant?.id || 'unknown';
  logger.warn(
    {
      tenantId,
      ip: req.ip,
      path: req.path,
      requestId: req.requestId,
    },
    'Rate limit exceeded'
  );

  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
      retryAfter: res.getHeader('Retry-After'),
    },
    request_id: req.requestId,
  });
}

// Skip rate limiting for certain conditions
function skipRateLimit(req: Request): boolean {
  // Skip health checks
  if (req.path === '/health' || req.path === '/ready') {
    return true;
  }
  // Skip metrics endpoint
  if (req.path === config.metrics.path) {
    return true;
  }
  return false;
}

// Create the rate limiter with Redis store if available
export function createRateLimiter() {
  if (!config.rateLimit.enabled) {
    return (_req: Request, _res: Response, next: () => void) => next();
  }

  const options: Parameters<typeof rateLimit>[0] = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skip: skipRateLimit,
    skipFailedRequests: config.rateLimit.skipFailedRequests,
  };

  // Use Redis store if available for distributed rate limiting
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    if (redis) {
      logger.info('Using Redis for distributed rate limiting');
      options.store = new RedisStore({
        // @ts-expect-error - RedisStore expects specific Redis client type
        sendCommand: (...args: string[]) => redis.call(...args),
        prefix: `${config.redis.keyPrefix}rl:`,
      });
    }
  } else {
    logger.info('Using memory store for rate limiting (not distributed)');
  }

  return rateLimit(options);
}

// Stricter rate limit for batch endpoints
export function createBatchRateLimiter() {
  if (!config.rateLimit.enabled) {
    return (_req: Request, _res: Response, next: () => void) => next();
  }

  const options: Parameters<typeof rateLimit>[0] = {
    windowMs: config.rateLimit.windowMs,
    max: Math.floor(config.rateLimit.maxRequests / 5), // 5x stricter for batch
    message: 'Too many batch requests',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skip: skipRateLimit,
  };

  if (isRedisAvailable()) {
    const redis = getRedisClient();
    if (redis) {
      options.store = new RedisStore({
        // @ts-expect-error - RedisStore expects specific Redis client type
        sendCommand: (...args: string[]) => redis.call(...args),
        prefix: `${config.redis.keyPrefix}rl:batch:`,
      });
    }
  }

  return rateLimit(options);
}

// Per-hour rate limiter for additional protection
export function createHourlyRateLimiter() {
  if (!config.rateLimit.enabled) {
    return (_req: Request, _res: Response, next: () => void) => next();
  }

  const options: Parameters<typeof rateLimit>[0] = {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: config.rateLimit.maxRequestsPerHour,
    message: 'Hourly rate limit exceeded',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `hourly:${keyGenerator(req)}`,
    handler: rateLimitHandler,
    skip: skipRateLimit,
  };

  if (isRedisAvailable()) {
    const redis = getRedisClient();
    if (redis) {
      options.store = new RedisStore({
        // @ts-expect-error - RedisStore expects specific Redis client type
        sendCommand: (...args: string[]) => redis.call(...args),
        prefix: `${config.redis.keyPrefix}rl:hourly:`,
      });
    }
  }

  return rateLimit(options);
}
