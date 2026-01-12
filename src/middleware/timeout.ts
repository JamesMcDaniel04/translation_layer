import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../services/logger';

export interface TimeoutOptions {
  timeout?: number;
  message?: string;
}

export function createTimeoutMiddleware(options: TimeoutOptions = {}) {
  const timeout = options.timeout ?? config.server.requestTimeout;
  const message = options.message ?? 'Request timeout';

  return function timeoutMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Skip timeout for streaming responses or long-running endpoints
    if (req.headers['x-no-timeout'] === 'true') {
      return next();
    }

    let timeoutId: NodeJS.Timeout | null = null;
    let finished = false;

    // Set up the timeout
    timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;

      logger.warn(
        {
          requestId: req.requestId,
          path: req.path,
          method: req.method,
          timeout,
        },
        'Request timeout'
      );

      if (!res.headersSent) {
        res.status(408).json({
          error: {
            code: 'REQUEST_TIMEOUT',
            message,
            timeout_ms: timeout,
          },
          request_id: req.requestId,
        });
      }
    }, timeout);

    // Clear timeout when response finishes
    const clearTimeoutHandler = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      finished = true;
    };

    res.on('finish', clearTimeoutHandler);
    res.on('close', clearTimeoutHandler);

    // Add abort controller for upstream cancellation
    const controller = new AbortController();
    (req as Request & { abortController: AbortController }).abortController = controller;

    // Abort on timeout
    const originalTimeout = timeoutId;
    timeoutId = setTimeout(() => {
      controller.abort();
      if (originalTimeout) clearTimeout(originalTimeout);
    }, timeout);

    next();
  };
}

// Helper to get abort signal from request
export function getAbortSignal(req: Request): AbortSignal | undefined {
  return (req as Request & { abortController?: AbortController }).abortController?.signal;
}
