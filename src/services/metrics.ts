import client from 'prom-client';
import { config } from '../config';
import { logger } from './logger';

// Initialize default metrics
if (config.metrics.enabled) {
  client.collectDefaultMetrics({
    labels: config.metrics.defaultLabels,
  });
}

// Custom metrics

// HTTP request metrics
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
});

// Translation metrics
export const translationRequestTotal = new client.Counter({
  name: 'translation_requests_total',
  help: 'Total number of translation requests',
  labelNames: ['provider', 'source_lang', 'target_lang', 'tenant_id', 'status'],
});

export const translationDuration = new client.Histogram({
  name: 'translation_duration_seconds',
  help: 'Duration of translation operations in seconds',
  labelNames: ['provider', 'tenant_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const translationCharacters = new client.Counter({
  name: 'translation_characters_total',
  help: 'Total number of characters translated',
  labelNames: ['provider', 'tenant_id'],
});

export const translationCost = new client.Counter({
  name: 'translation_cost_usd_total',
  help: 'Estimated total translation cost in USD',
  labelNames: ['provider', 'tenant_id'],
});

// Language detection metrics
export const languageDetectionTotal = new client.Counter({
  name: 'language_detection_total',
  help: 'Total number of language detections',
  labelNames: ['detected_lang', 'tenant_id'],
});

export const languageDetectionDuration = new client.Histogram({
  name: 'language_detection_duration_seconds',
  help: 'Duration of language detection in seconds',
  labelNames: ['tenant_id'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
});

// Cache metrics
export const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
});

export const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
});

// Circuit breaker metrics
export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['provider'],
});

export const circuitBreakerFailures = new client.Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  labelNames: ['provider'],
});

// Rate limit metrics
export const rateLimitHits = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['tenant_id', 'limit_type'],
});

// Database metrics
export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

export const dbConnectionPoolSize = new client.Gauge({
  name: 'db_connection_pool_size',
  help: 'Current database connection pool size',
  labelNames: ['state'],
});

// Error metrics
export const errorTotal = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'component'],
});

// Get metrics registry
export function getMetricsRegistry(): client.Registry {
  return client.register;
}

// Get metrics as string (for /metrics endpoint)
export async function getMetrics(): Promise<string> {
  return client.register.metrics();
}

// Get metrics content type
export function getMetricsContentType(): string {
  return client.register.contentType;
}

// Helper to record translation metrics
export function recordTranslation(
  provider: string,
  sourceLang: string,
  targetLang: string,
  tenantId: string,
  chars: number,
  durationMs: number,
  success: boolean,
  estimatedCostUsd?: number
): void {
  if (!config.metrics.enabled) return;

  const status = success ? 'success' : 'failure';

  translationRequestTotal.inc({
    provider,
    source_lang: sourceLang,
    target_lang: targetLang,
    tenant_id: tenantId,
    status,
  });

  translationDuration.observe(
    { provider, tenant_id: tenantId },
    durationMs / 1000
  );

  if (success) {
    translationCharacters.inc({ provider, tenant_id: tenantId }, chars);

    if (estimatedCostUsd) {
      translationCost.inc({ provider, tenant_id: tenantId }, estimatedCostUsd);
    }
  }
}

// Helper to record language detection
export function recordLanguageDetection(
  detectedLang: string,
  tenantId: string,
  durationMs: number
): void {
  if (!config.metrics.enabled) return;

  languageDetectionTotal.inc({ detected_lang: detectedLang, tenant_id: tenantId });
  languageDetectionDuration.observe({ tenant_id: tenantId }, durationMs / 1000);
}

// Helper to record cache operations
export function recordCacheOperation(cacheType: string, hit: boolean): void {
  if (!config.metrics.enabled) return;

  if (hit) {
    cacheHits.inc({ cache_type: cacheType });
  } else {
    cacheMisses.inc({ cache_type: cacheType });
  }
}

// Helper to record HTTP request
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  tenantId: string,
  durationMs: number
): void {
  if (!config.metrics.enabled) return;

  const labels = {
    method,
    route,
    status_code: statusCode.toString(),
    tenant_id: tenantId,
  };

  httpRequestTotal.inc(labels);
  httpRequestDuration.observe(labels, durationMs / 1000);
}

// Helper to update circuit breaker state
export function updateCircuitBreakerMetrics(
  provider: string,
  state: 'closed' | 'open' | 'half-open'
): void {
  if (!config.metrics.enabled) return;

  const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
  circuitBreakerState.set({ provider }, stateValue);
}

logger.info('Prometheus metrics initialized');
