import express, { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './services/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createRateLimiter, createHourlyRateLimiter } from './middleware/rateLimit';
import { createTimeoutMiddleware } from './middleware/timeout';
import { createRoutes } from './routes';
import { recordHttpRequest } from './services/metrics';

export function createApp(): Express {
  const app = express();

  // Security headers with Helmet
  if (config.security.helmetEnabled) {
    app.use(
      helmet({
        contentSecurityPolicy: false, // API doesn't serve HTML
        crossOriginEmbedderPolicy: false,
      })
    );
  }

  // Request logging with Pino
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => {
          // Don't log health checks
          return req.url === '/health' || req.url === '/ready';
        },
      },
      customProps: (req) => ({
        requestId: req.id,
        tenantId: (req as express.Request & { tenant?: { id: string } }).tenant?.id,
      }),
      redact: config.logging.redactPaths,
    })
  );

  // Basic middleware
  app.use(express.json({ limit: config.security.maxRequestSize }));
  app.use(express.urlencoded({ extended: true }));

  // Request timeout
  app.use(createTimeoutMiddleware());

  // CORS handling
  if (config.security.corsEnabled) {
    app.use((req, res, next) => {
      const origin = req.headers.origin || '*';
      const allowedOrigins = config.security.corsOrigins;

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, x-api-key, x-admin-key, x-request-id'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After');

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send();
        return;
      }

      next();
    });
  }

  // Trust proxy (for accurate IP logging behind load balancer)
  if (!config.server.isDev) {
    app.set('trust proxy', 1);
  }

  // Rate limiting (applied globally)
  app.use(createRateLimiter());
  app.use(createHourlyRateLimiter());

  // Metrics recording middleware
  app.use((req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const tenantId = (req as express.Request & { tenant?: { id: string } }).tenant?.id || 'anonymous';
      const route = req.route?.path || req.path;

      recordHttpRequest(req.method, route, res.statusCode, tenantId, duration);
    });

    next();
  });

  // Mount routes
  app.use(createRoutes());

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}
