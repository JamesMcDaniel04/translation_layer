import { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '../utils/helpers';

// Extend Request type to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate and attach request ID
  req.requestId = generateRequestId();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);

  // Log request start
  console.info(`[${req.requestId}] --> ${req.method} ${req.path}`);

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    console.info(
      `[${req.requestId}] <-- ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });

  next();
}
