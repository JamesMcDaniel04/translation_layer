import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AuthenticationError } from '../types';
import { authLogger } from '../services/logger';

export function adminAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const adminKey = req.headers[config.api.adminKeyHeader] as string;

  // In development, allow admin access with dev key
  if (config.server.isDev && adminKey === 'dev-admin-key') {
    authLogger.debug('Admin auth: development mode access granted');
    return next();
  }

  // In production, require valid admin key
  if (!config.api.adminApiKey) {
    authLogger.warn('Admin auth: ADMIN_API_KEY not configured');
    return next(new AuthenticationError('Admin API not configured'));
  }

  if (!adminKey) {
    authLogger.warn('Admin auth: missing admin key');
    return next(new AuthenticationError('Missing admin API key'));
  }

  if (adminKey !== config.api.adminApiKey) {
    authLogger.warn('Admin auth: invalid admin key');
    return next(new AuthenticationError('Invalid admin API key'));
  }

  authLogger.debug('Admin auth: access granted');
  next();
}
