import { Router } from 'express';
import healthRoutes from './health';
import normalizeRoutes from './normalize';

export function createRoutes(): Router {
  const router = Router();

  // Health check routes (no auth required)
  router.use(healthRoutes);

  // API v1 routes
  router.use('/v1', normalizeRoutes);

  // Root endpoint
  router.get('/', (_req, res) => {
    res.json({
      name: 'Translation Layer API',
      version: '1.0.0',
      docs: '/v1/normalize',
      health: '/health',
    });
  });

  return router;
}
