import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { tenantRepository } from '../db/repositories/tenant';
import { apiKeyRepository } from '../db/repositories/apiKey';
import { auditLogRepository, logAudit } from '../db/repositories/auditLog';
import { usageLogRepository } from '../db/repositories/usageLog';
import { ValidationError, NotFoundError, TranslatorProvider } from '../types';
import { getAllCircuitBreakerStats, resetCircuitBreaker } from '../services/circuitBreaker';
import { getCacheStats, invalidateCache } from '../services/cache';
import { logger } from '../services/logger';

const router = Router();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);

// Validation schemas
const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  translator_provider: z.enum(['deepl', 'google']).default('deepl'),
  glossary: z.object({
    preserve: z.array(z.string()).default([]),
  }).default({ preserve: [] }),
  rate_limit_override: z.object({
    requests_per_minute: z.number().positive().optional(),
    requests_per_hour: z.number().positive().optional(),
  }).optional(),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  translator_provider: z.enum(['deepl', 'google']).optional(),
  glossary: z.object({
    preserve: z.array(z.string()),
  }).optional(),
  rate_limit_override: z.object({
    requests_per_minute: z.number().positive().optional(),
    requests_per_hour: z.number().positive().optional(),
  }).nullable().optional(),
});

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  expires_in_days: z.number().positive().max(365).optional(),
});

// ============ Tenant Management ============

// List all tenants
router.get('/tenants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const tenants = await tenantRepository.list(limit, offset);

    res.json({
      data: tenants,
      pagination: { limit, offset },
    });
  } catch (error) {
    next(error);
  }
});

// Get single tenant
router.get('/tenants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantRepository.findById(req.params.id);

    if (!tenant) {
      throw new NotFoundError(`Tenant not found: ${req.params.id}`);
    }

    res.json({ data: tenant });
  } catch (error) {
    next(error);
  }
});

// Create tenant
router.post('/tenants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = CreateTenantSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.message);
    }

    const data = parseResult.data;
    const tenant = await tenantRepository.create({
      name: data.name,
      translator_provider: data.translator_provider as TranslatorProvider,
      glossary: data.glossary,
    });

    await logAudit({
      tenant_id: tenant.id,
      action: 'tenant.create',
      resource_type: 'tenant',
      resource_id: tenant.id,
      actor_type: 'system',
      details: { name: tenant.name },
      outcome: 'success',
      ip_address: req.ip,
    });

    logger.info({ tenantId: tenant.id, name: tenant.name }, 'Tenant created');

    res.status(201).json({ data: tenant });
  } catch (error) {
    next(error);
  }
});

// Update tenant
router.patch('/tenants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = UpdateTenantSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.message);
    }

    const existing = await tenantRepository.findById(req.params.id);
    if (!existing) {
      throw new NotFoundError(`Tenant not found: ${req.params.id}`);
    }

    const tenant = await tenantRepository.update(req.params.id, parseResult.data as Parameters<typeof tenantRepository.update>[1]);

    await logAudit({
      tenant_id: req.params.id,
      action: 'tenant.update',
      resource_type: 'tenant',
      resource_id: req.params.id,
      actor_type: 'system',
      details: parseResult.data,
      outcome: 'success',
      ip_address: req.ip,
    });

    res.json({ data: tenant });
  } catch (error) {
    next(error);
  }
});

// Delete tenant
router.delete('/tenants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await tenantRepository.findById(req.params.id);
    if (!existing) {
      throw new NotFoundError(`Tenant not found: ${req.params.id}`);
    }

    await tenantRepository.delete(req.params.id);

    await logAudit({
      tenant_id: req.params.id,
      action: 'tenant.delete',
      resource_type: 'tenant',
      resource_id: req.params.id,
      actor_type: 'system',
      details: { name: existing.name },
      outcome: 'success',
      ip_address: req.ip,
    });

    logger.info({ tenantId: req.params.id }, 'Tenant deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============ API Key Management ============

// List API keys for tenant
router.get('/tenants/:tenantId/api-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantRepository.findById(req.params.tenantId);
    if (!tenant) {
      throw new NotFoundError(`Tenant not found: ${req.params.tenantId}`);
    }

    const keys = await apiKeyRepository.findByTenantId(req.params.tenantId);

    // Don't return the actual key hash
    const safeKeys = keys.map((k) => ({
      id: k.id,
      tenant_id: k.tenant_id,
      name: k.name,
      active: k.active,
      expires_at: k.expires_at,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
    }));

    res.json({ data: safeKeys });
  } catch (error) {
    next(error);
  }
});

// Create API key for tenant
router.post('/tenants/:tenantId/api-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = CreateApiKeySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.message);
    }

    const tenant = await tenantRepository.findById(req.params.tenantId);
    if (!tenant) {
      throw new NotFoundError(`Tenant not found: ${req.params.tenantId}`);
    }

    const { apiKey, rawKey } = await apiKeyRepository.create({
      tenant_id: req.params.tenantId,
      name: parseResult.data.name,
    });

    await logAudit({
      tenant_id: req.params.tenantId,
      action: 'api_key.create',
      resource_type: 'api_key',
      resource_id: apiKey.id,
      actor_type: 'system',
      details: { name: apiKey.name },
      outcome: 'success',
      ip_address: req.ip,
    });

    logger.info({ tenantId: req.params.tenantId, keyId: apiKey.id }, 'API key created');

    // Return the raw key ONLY on creation
    res.status(201).json({
      data: {
        id: apiKey.id,
        tenant_id: apiKey.tenant_id,
        name: apiKey.name,
        active: apiKey.active,
        created_at: apiKey.created_at,
      },
      key: rawKey, // This is the only time the raw key is returned
      warning: 'Store this key securely. It cannot be retrieved again.',
    });
  } catch (error) {
    next(error);
  }
});

// Deactivate API key
router.post('/api-keys/:id/deactivate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = await apiKeyRepository.findById(req.params.id);
    if (!key) {
      throw new NotFoundError(`API key not found: ${req.params.id}`);
    }

    await apiKeyRepository.deactivate(req.params.id);

    await logAudit({
      tenant_id: key.tenant_id,
      action: 'api_key.deactivate',
      resource_type: 'api_key',
      resource_id: req.params.id,
      actor_type: 'system',
      outcome: 'success',
      ip_address: req.ip,
    });

    res.json({ message: 'API key deactivated' });
  } catch (error) {
    next(error);
  }
});

// Activate API key
router.post('/api-keys/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = await apiKeyRepository.findById(req.params.id);
    if (!key) {
      throw new NotFoundError(`API key not found: ${req.params.id}`);
    }

    await apiKeyRepository.activate(req.params.id);

    await logAudit({
      tenant_id: key.tenant_id,
      action: 'api_key.activate',
      resource_type: 'api_key',
      resource_id: req.params.id,
      actor_type: 'system',
      outcome: 'success',
      ip_address: req.ip,
    });

    res.json({ message: 'API key activated' });
  } catch (error) {
    next(error);
  }
});

// Delete API key
router.delete('/api-keys/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = await apiKeyRepository.findById(req.params.id);
    if (!key) {
      throw new NotFoundError(`API key not found: ${req.params.id}`);
    }

    await apiKeyRepository.delete(req.params.id);

    await logAudit({
      tenant_id: key.tenant_id,
      action: 'api_key.delete',
      resource_type: 'api_key',
      resource_id: req.params.id,
      actor_type: 'system',
      outcome: 'success',
      ip_address: req.ip,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============ Usage & Stats ============

// Get tenant usage statistics
router.get('/tenants/:tenantId/usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantRepository.findById(req.params.tenantId);
    if (!tenant) {
      throw new NotFoundError(`Tenant not found: ${req.params.tenantId}`);
    }

    const startDate = req.query.start_date
      ? new Date(req.query.start_date as string)
      : undefined;
    const endDate = req.query.end_date
      ? new Date(req.query.end_date as string)
      : undefined;

    const stats = await usageLogRepository.getStats(req.params.tenantId, startDate, endDate);

    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
});

// Get audit logs for tenant
router.get('/tenants/:tenantId/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantRepository.findById(req.params.tenantId);
    if (!tenant) {
      throw new NotFoundError(`Tenant not found: ${req.params.tenantId}`);
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await auditLogRepository.findByTenantId(req.params.tenantId, limit, offset);

    res.json({ data: logs, pagination: { limit, offset } });
  } catch (error) {
    next(error);
  }
});

// ============ System Operations ============

// Get circuit breaker status
router.get('/system/circuit-breakers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = getAllCircuitBreakerStats();
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
});

// Reset circuit breaker
router.post('/system/circuit-breakers/:provider/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = resetCircuitBreaker(req.params.provider);
    if (!success) {
      throw new NotFoundError(`Circuit breaker not found: ${req.params.provider}`);
    }

    await logAudit({
      action: 'circuit_breaker.reset',
      resource_type: 'circuit_breaker',
      resource_id: req.params.provider,
      actor_type: 'system',
      outcome: 'success',
      ip_address: req.ip,
    });

    res.json({ message: `Circuit breaker ${req.params.provider} reset` });
  } catch (error) {
    next(error);
  }
});

// Get cache status
router.get('/system/cache', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = getCacheStats();
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
});

// Invalidate cache
router.post('/system/cache/invalidate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pattern = (req.body.pattern as string) || '*';
    const count = await invalidateCache(pattern);

    await logAudit({
      action: 'cache.invalidate',
      resource_type: 'cache',
      actor_type: 'system',
      details: { pattern, invalidated_count: count },
      outcome: 'success',
      ip_address: req.ip,
    });

    res.json({ message: `Invalidated ${count} cache entries`, count });
  } catch (error) {
    next(error);
  }
});

export default router;
