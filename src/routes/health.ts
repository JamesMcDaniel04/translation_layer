import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import { isDetectorAvailable, getModelError } from '../services/languageDetector';
import { getAvailableTranslators } from '../providers/factory';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: { status: string; latency_ms?: number };
    language_detector: { status: string; error?: string };
    translators: Record<string, boolean>;
  };
}

interface MetricsResponse {
  uptime_seconds: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  translators: Record<string, boolean>;
  language_detector: boolean;
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
  });
});

/**
 * Readiness probe - checks if service is ready to accept traffic
 * Returns 503 if dependencies are not available
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: HealthStatus['checks'] = {
    database: { status: 'unknown' },
    language_detector: { status: 'unknown' },
    translators: {},
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
    checks.database = { status: 'unhealthy' };
    isHealthy = false;
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
 * Metrics endpoint for monitoring
 */
router.get('/metrics', (_req: Request, res: Response) => {
  const memory = process.memoryUsage();

  const metrics: MetricsResponse = {
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    memory: {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss,
    },
    translators: getAvailableTranslators(),
    language_detector: isDetectorAvailable(),
  };

  res.status(200).json(metrics);
});

export default router;
