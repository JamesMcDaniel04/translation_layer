import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import { isDetectorAvailable, getModelError } from '../services/languageDetector';
import { getAvailableTranslators } from '../providers/factory';
import { isRedisAvailable } from '../services/redis';
import { getCacheStats } from '../services/cache';
import { getAllCircuitBreakerStats } from '../services/circuitBreaker';
import { getMetrics, getMetricsContentType } from '../services/metrics';
import { config } from '../config';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: { status: string; latency_ms?: number; error?: string };
    redis: { status: string; available: boolean };
    language_detector: { status: string; error?: string };
    translators: Record<string, boolean>;
    circuit_breakers?: Array<{
      name: string;
      state: string;
      healthy: boolean;
    }>;
  };
}

interface DetailedHealthStatus extends HealthStatus {
  config: {
    rate_limiting: boolean;
    caching: boolean;
    circuit_breaker: boolean;
    metrics: boolean;
  };
  cache: {
    memory_size: number;
    max_size: number;
    redis_available: boolean;
  };
  memory: {
    heap_used_mb: number;
    heap_total_mb: number;
    rss_mb: number;
  };
}

const startTime = Date.now();

/**
 * Basic health check - returns 200 if service is running
 * Used by load balancers and container orchestration
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

/**
 * Readiness probe - checks if service is ready to accept traffic
 * Returns 503 if critical dependencies are not available
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: HealthStatus['checks'] = {
    database: { status: 'unknown' },
    redis: { status: 'unknown', available: false },
    language_detector: { status: 'unknown' },
    translators: {},
    circuit_breakers: [],
  };

  let isHealthy = true;
  let isDegraded = false;

  // Check database
  try {
    const pool = getPool();
    const start = Date.now();
    await pool.query('SELECT 1');
    checks.database = {
      status: 'healthy',
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: (error as Error).message,
    };
    isHealthy = false;
  }

  // Check Redis
  const redisAvailable = isRedisAvailable();
  checks.redis = {
    status: config.redis.enabled
      ? redisAvailable ? 'healthy' : 'unhealthy'
      : 'disabled',
    available: redisAvailable,
  };
  if (config.redis.enabled && !redisAvailable) {
    isDegraded = true;
  }

  // Check language detector
  if (isDetectorAvailable()) {
    checks.language_detector = { status: 'healthy' };
  } else {
    const modelError = getModelError();
    checks.language_detector = {
      status: 'degraded',
      error: modelError?.message || 'Model not loaded',
    };
    isDegraded = true;
  }

  // Check translators
  checks.translators = getAvailableTranslators();
  const hasTranslator = Object.values(checks.translators).some((v) => v);
  if (!hasTranslator) {
    isDegraded = true;
  }

  // Check circuit breakers
  const cbStats = getAllCircuitBreakerStats();
  checks.circuit_breakers = cbStats.map((cb) => ({
    name: cb.name,
    state: cb.state,
    healthy: cb.state === 'closed',
  }));
  const hasOpenBreaker = cbStats.some((cb) => cb.state === 'open');
  if (hasOpenBreaker) {
    isDegraded = true;
  }

  const status: HealthStatus = {
    status: isHealthy ? (isDegraded ? 'degraded' : 'healthy') : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  };

  res.status(isHealthy ? 200 : 503).json(status);
});

/**
 * Detailed health check with configuration and resource info
 * For admin/debugging purposes
 */
router.get('/health/detailed', async (_req: Request, res: Response) => {
  const checks: HealthStatus['checks'] = {
    database: { status: 'unknown' },
    redis: { status: 'unknown', available: false },
    language_detector: { status: 'unknown' },
    translators: {},
    circuit_breakers: [],
  };

  let isHealthy = true;
  let isDegraded = false;

  // Check database
  try {
    const pool = getPool();
    const start = Date.now();
    await pool.query('SELECT 1');
    checks.database = {
      status: 'healthy',
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: (error as Error).message,
    };
    isHealthy = false;
  }

  // Check Redis
  const redisAvailable = isRedisAvailable();
  checks.redis = {
    status: config.redis.enabled
      ? redisAvailable ? 'healthy' : 'unhealthy'
      : 'disabled',
    available: redisAvailable,
  };
  if (config.redis.enabled && !redisAvailable) {
    isDegraded = true;
  }

  // Check language detector
  if (isDetectorAvailable()) {
    checks.language_detector = { status: 'healthy' };
  } else {
    const modelError = getModelError();
    checks.language_detector = {
      status: 'degraded',
      error: modelError?.message || 'Model not loaded',
    };
    isDegraded = true;
  }

  // Check translators
  checks.translators = getAvailableTranslators();
  const hasTranslator = Object.values(checks.translators).some((v) => v);
  if (!hasTranslator) {
    isDegraded = true;
  }

  // Check circuit breakers
  const cbStats = getAllCircuitBreakerStats();
  checks.circuit_breakers = cbStats.map((cb) => ({
    name: cb.name,
    state: cb.state,
    healthy: cb.state === 'closed',
  }));

  // Get cache stats
  const cacheStats = getCacheStats();

  // Get memory stats
  const memory = process.memoryUsage();

  const status: DetailedHealthStatus = {
    status: isHealthy ? (isDegraded ? 'degraded' : 'healthy') : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    checks,
    config: {
      rate_limiting: config.rateLimit.enabled,
      caching: config.cache.enabled,
      circuit_breaker: config.circuitBreaker.enabled,
      metrics: config.metrics.enabled,
    },
    cache: {
      memory_size: cacheStats.memorySize,
      max_size: cacheStats.maxSize,
      redis_available: cacheStats.redisAvailable,
    },
    memory: {
      heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
      rss_mb: Math.round(memory.rss / 1024 / 1024),
    },
  };

  res.status(isHealthy ? 200 : 503).json(status);
});

/**
 * Basic metrics endpoint (JSON format)
 */
router.get('/metrics', (_req: Request, res: Response) => {
  const memory = process.memoryUsage();
  const cacheStats = getCacheStats();

  const metrics = {
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    memory: {
      heap_used: memory.heapUsed,
      heap_total: memory.heapTotal,
      rss: memory.rss,
    },
    translators: getAvailableTranslators(),
    language_detector: isDetectorAvailable(),
    cache: cacheStats,
    circuit_breakers: getAllCircuitBreakerStats(),
  };

  res.status(200).json(metrics);
});

/**
 * Prometheus metrics endpoint
 */
router.get(config.metrics.path, async (_req: Request, res: Response) => {
  if (!config.metrics.enabled) {
    res.status(404).json({ error: 'Metrics disabled' });
    return;
  }

  try {
    const metrics = await getMetrics();
    res.set('Content-Type', getMetricsContentType());
    res.send(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

export default router;
