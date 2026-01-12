import CircuitBreaker from 'opossum';
import { config } from '../config';
import { logger, translationLogger } from './logger';
import { TranslationResult, TranslationError } from '../types';

// Circuit breaker instances per provider
const circuitBreakers = new Map<string, CircuitBreaker>();

interface CircuitBreakerOptions {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  volumeThreshold: number;
}

function getDefaultOptions(): CircuitBreakerOptions {
  return {
    timeout: config.circuitBreaker.timeout,
    errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
    resetTimeout: config.circuitBreaker.resetTimeout,
    volumeThreshold: config.circuitBreaker.volumeThreshold,
  };
}

type TranslationFunction = (
  text: string,
  sourceLang: string,
  targetLang: string
) => Promise<TranslationResult>;

export function createCircuitBreaker(
  name: string,
  fn: TranslationFunction,
  options?: Partial<CircuitBreakerOptions>
): CircuitBreaker {
  if (!config.circuitBreaker.enabled) {
    // Return a pass-through circuit breaker
    const passThrough = new CircuitBreaker(fn, { enabled: false });
    return passThrough;
  }

  const opts = { ...getDefaultOptions(), ...options };

  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    volumeThreshold: opts.volumeThreshold,
    name,
  });

  // Event handlers for monitoring
  breaker.on('success', (result) => {
    translationLogger.debug({ provider: name, success: true }, 'Circuit breaker: success');
  });

  breaker.on('timeout', () => {
    translationLogger.warn({ provider: name }, 'Circuit breaker: timeout');
  });

  breaker.on('reject', () => {
    translationLogger.warn({ provider: name }, 'Circuit breaker: rejected (circuit open)');
  });

  breaker.on('open', () => {
    translationLogger.error({ provider: name }, 'Circuit breaker: OPENED (too many failures)');
  });

  breaker.on('halfOpen', () => {
    translationLogger.info({ provider: name }, 'Circuit breaker: half-open (testing)');
  });

  breaker.on('close', () => {
    translationLogger.info({ provider: name }, 'Circuit breaker: CLOSED (recovered)');
  });

  breaker.on('fallback', () => {
    translationLogger.info({ provider: name }, 'Circuit breaker: fallback triggered');
  });

  breaker.fallback(() => {
    throw new TranslationError(
      `Translation provider ${name} is currently unavailable. Please try again later.`
    );
  });

  circuitBreakers.set(name, breaker);
  logger.info({ provider: name, options: opts }, 'Circuit breaker created');

  return breaker;
}

export function getCircuitBreaker(name: string): CircuitBreaker | undefined {
  return circuitBreakers.get(name);
}

export function getCircuitBreakerStats(name: string): CircuitBreakerStats | null {
  const breaker = circuitBreakers.get(name);
  if (!breaker) return null;

  const stats = breaker.stats;
  return {
    name,
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
    enabled: breaker.enabled,
    stats: {
      fires: stats.fires,
      successes: stats.successes,
      failures: stats.failures,
      rejects: stats.rejects,
      timeouts: stats.timeouts,
      fallbacks: stats.fallbacks,
      latencyMean: stats.latencyMean,
      latencyP99: (stats as Record<string, unknown>).percentiles?.['0.99'] as number | undefined,
    },
  };
}

export interface CircuitBreakerStats {
  name: string;
  state: 'open' | 'half-open' | 'closed';
  enabled: boolean;
  stats: {
    fires: number;
    successes: number;
    failures: number;
    rejects: number;
    timeouts: number;
    fallbacks: number;
    latencyMean: number;
    latencyP99?: number;
  };
}

export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  const stats: CircuitBreakerStats[] = [];
  for (const [name] of circuitBreakers) {
    const stat = getCircuitBreakerStats(name);
    if (stat) stats.push(stat);
  }
  return stats;
}

// Reset a specific circuit breaker (for admin operations)
export function resetCircuitBreaker(name: string): boolean {
  const breaker = circuitBreakers.get(name);
  if (!breaker) return false;

  breaker.close();
  logger.info({ provider: name }, 'Circuit breaker manually reset');
  return true;
}

// Reset all circuit breakers
export function resetAllCircuitBreakers(): void {
  for (const [name, breaker] of circuitBreakers) {
    breaker.close();
    logger.info({ provider: name }, 'Circuit breaker reset');
  }
}
