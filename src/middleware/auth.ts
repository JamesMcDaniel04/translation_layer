import { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from '../types';
import { config } from '../config';
import { ApiKeyRepository } from '../db/repositories/apiKey';
import { TenantRepository } from '../db/repositories/tenant';
import { hashApiKey } from '../utils/helpers';

// Extend Request to include tenant information
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        translator_provider: string;
        glossary: { preserve: string[] };
      };
    }
  }
}

export function createAuthMiddleware(
  apiKeyRepo: ApiKeyRepository,
  tenantRepo: TenantRepository
) {
  return async function authMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const apiKey = req.headers[config.api.keyHeader] as string;

      if (!apiKey) {
        throw new AuthenticationError('Missing API key');
      }

      // Hash the provided key and look it up
      const keyHash = hashApiKey(apiKey);
      const keyRecord = await apiKeyRepo.findByHash(keyHash);

      if (!keyRecord || !keyRecord.active) {
        throw new AuthenticationError('Invalid or inactive API key');
      }

      // Get tenant information
      const tenant = await tenantRepo.findById(keyRecord.tenant_id);

      if (!tenant) {
        throw new AuthenticationError('Tenant not found');
      }

      // Attach tenant to request
      req.tenant = {
        id: tenant.id,
        name: tenant.name,
        translator_provider: tenant.translator_provider,
        glossary: tenant.glossary,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Simple API key auth for development/testing (bypasses DB lookup)
export function simpleAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = req.headers[config.api.keyHeader] as string;

  if (!apiKey) {
    return next(new AuthenticationError('Missing API key'));
  }

  // For development: accept any key starting with "tl_"
  if (config.server.isDev && apiKey.startsWith('tl_')) {
    req.tenant = {
      id: 'dev-tenant',
      name: 'Development Tenant',
      translator_provider: config.translation.defaultProvider as string,
      glossary: { preserve: [] },
    };
    return next();
  }

  next(new AuthenticationError('Invalid API key'));
}
