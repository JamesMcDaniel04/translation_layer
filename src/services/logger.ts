import pino from 'pino';
import { config } from '../config';

// Create the base logger instance
export const logger = pino({
  level: config.logging.level,
  transport: config.logging.prettyPrint
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  redact: config.logging.redactPaths,
  base: {
    env: config.server.env,
    service: 'translation-layer',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      remoteAddress: req.ip || req.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

// Child logger factory for request-scoped logging
export function createRequestLogger(requestId: string, tenantId?: string) {
  return logger.child({
    requestId,
    tenantId,
  });
}

// Specific loggers for different domains
export const dbLogger = logger.child({ component: 'database' });
export const translationLogger = logger.child({ component: 'translation' });
export const detectionLogger = logger.child({ component: 'detection' });
export const authLogger = logger.child({ component: 'auth' });
export const metricsLogger = logger.child({ component: 'metrics' });

// Audit logging for compliance
export interface AuditEvent {
  action: string;
  tenantId?: string;
  userId?: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  outcome: 'success' | 'failure';
  reason?: string;
}

export function logAuditEvent(event: AuditEvent) {
  if (!config.audit.enabled) return;

  logger.info(
    {
      audit: true,
      ...event,
      timestamp: new Date().toISOString(),
    },
    `AUDIT: ${event.action} ${event.resourceType}`
  );
}

// Performance logging
export function logPerformance(
  operation: string,
  durationMs: number,
  metadata?: Record<string, unknown>
) {
  const level = durationMs > 5000 ? 'warn' : durationMs > 1000 ? 'info' : 'debug';
  logger[level](
    {
      performance: true,
      operation,
      durationMs,
      ...metadata,
    },
    `Performance: ${operation} took ${durationMs}ms`
  );
}

// Error logging with context
export function logError(
  error: Error,
  context?: Record<string, unknown>
) {
  logger.error(
    {
      err: error,
      ...context,
    },
    error.message
  );
}

export default logger;
