import dotenv from 'dotenv';

dotenv.config();

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseArray(value: string | undefined, defaultValue: string[]): string[] {
  if (!value) return defaultValue;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    isDev: process.env.NODE_ENV !== 'production',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/translation_layer',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '30000', 10),
    connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '5000', 10),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    enabled: parseBoolean(process.env.REDIS_ENABLED, false),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'tl:',
  },

  cache: {
    enabled: parseBoolean(process.env.CACHE_ENABLED, true),
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10),
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '10000', 10),
  },

  rateLimit: {
    enabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    maxRequestsPerHour: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_HOUR || '1000', 10),
    skipFailedRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_FAILED, false),
  },

  circuitBreaker: {
    enabled: parseBoolean(process.env.CIRCUIT_BREAKER_ENABLED, true),
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '10000', 10),
    errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000', 10),
    volumeThreshold: parseInt(process.env.CIRCUIT_BREAKER_VOLUME_THRESHOLD || '5', 10),
  },

  translation: {
    deepl: {
      apiKey: process.env.DEEPL_API_KEY || '',
    },
    google: {
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    },
    defaultProvider: process.env.DEFAULT_TRANSLATOR || 'deepl',
    defaultTargetLang: process.env.DEFAULT_TARGET_LANG || 'en',
    timeout: parseInt(process.env.TRANSLATION_TIMEOUT_MS || '15000', 10),
    maxRetries: parseInt(process.env.TRANSLATION_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.TRANSLATION_RETRY_DELAY_MS || '1000', 10),
  },

  languageDetection: {
    minChars: parseInt(process.env.LANG_DETECT_MIN_CHARS || '10', 10),
    confidenceThreshold: parseFloat(process.env.LANG_DETECT_CONFIDENCE_THRESHOLD || '0.7'),
    modelPath: process.env.FASTTEXT_MODEL_PATH || './models/lid.176.bin',
  },

  api: {
    keyHeader: process.env.API_KEY_HEADER || 'x-api-key',
    adminKeyHeader: process.env.ADMIN_API_KEY_HEADER || 'x-admin-key',
    adminApiKey: process.env.ADMIN_API_KEY || '',
  },

  security: {
    corsOrigins: parseArray(process.env.CORS_ORIGINS, ['*']),
    corsEnabled: parseBoolean(process.env.CORS_ENABLED, true),
    helmetEnabled: parseBoolean(process.env.HELMET_ENABLED, true),
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: parseBoolean(process.env.LOG_PRETTY_PRINT, process.env.NODE_ENV !== 'production'),
    redactPaths: parseArray(process.env.LOG_REDACT_PATHS, ['req.headers.authorization', 'req.headers["x-api-key"]']),
  },

  metrics: {
    enabled: parseBoolean(process.env.METRICS_ENABLED, true),
    path: process.env.METRICS_PATH || '/metrics/prometheus',
    defaultLabels: {
      app: 'translation-layer',
      env: process.env.NODE_ENV || 'development',
    },
  },

  audit: {
    enabled: parseBoolean(process.env.AUDIT_LOGGING_ENABLED, true),
  },
} as const;

export type Config = typeof config;

// Validate critical configuration at startup
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (!config.translation.deepl.apiKey && !config.translation.google.credentialsPath) {
    errors.push('At least one translation provider must be configured (DEEPL_API_KEY or GOOGLE_APPLICATION_CREDENTIALS)');
  }

  if (config.redis.enabled && !config.redis.url) {
    errors.push('REDIS_URL is required when REDIS_ENABLED is true');
  }

  if (!config.server.isDev && !config.api.adminApiKey) {
    console.warn('Warning: ADMIN_API_KEY not set in production environment');
  }

  if (!config.server.isDev && config.security.corsOrigins.includes('*')) {
    console.warn('Warning: CORS wildcard (*) is enabled in production - consider restricting origins');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}
