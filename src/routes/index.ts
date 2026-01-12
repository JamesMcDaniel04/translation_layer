import { Router } from 'express';
import healthRoutes from './health';
import normalizeRoutes from './normalize';
import adminRoutes from './admin';
import { config } from '../config';

export function createRoutes(): Router {
  const router = Router();

  // Health check routes (no auth required)
  router.use(healthRoutes);

  // API v1 routes
  router.use('/v1', normalizeRoutes);

  // Admin API routes
  router.use('/v1/admin', adminRoutes);

  // Root endpoint
  router.get('/', (_req, res) => {
    res.json({
      name: 'Translation Layer API',
      version: '1.0.0',
      environment: config.server.env,
      endpoints: {
        normalize: '/v1/normalize',
        batch: '/v1/normalize/batch',
        languages: '/v1/normalize/languages',
        admin: '/v1/admin',
        health: '/health',
        ready: '/ready',
        metrics: '/metrics',
        prometheus: config.metrics.path,
      },
    });
  });

  return router;
}
