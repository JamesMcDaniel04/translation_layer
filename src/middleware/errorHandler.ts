import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../types';
import { config } from '../config';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id?: string;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const validationError = new ValidationError('Invalid request body');
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
      request_id: requestId,
    };
    res.status(validationError.statusCode).json(response);
    return;
  }

  // Handle custom app errors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
      },
      request_id: requestId,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);

  // Handle unexpected errors
  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: config.server.isDev ? err.message : 'An unexpected error occurred',
    },
    request_id: requestId,
  };
  res.status(500).json(response);
}

// 404 handler
export function notFoundHandler(req: Request, res: Response): void {
  const response: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  };
  res.status(404).json(response);
}
