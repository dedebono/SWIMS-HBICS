import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.js';
import { ZodError } from 'zod';

/**
 * Centralized error handler for Express.
 * Maps custom errors and Zod validation errors to proper HTTP responses.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    sendError(res, `Validation failed: ${messages.join('; ')}`, 400);
    return;
  }

  // Application errors
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  // Unexpected errors
  console.error('[UNHANDLED_ERROR]', err);
  sendError(
    res,
    process.env['NODE_ENV'] === 'production'
      ? 'Internal server error'
      : err.message,
    500,
  );
}

/**
 * Wrapper for async route handlers to catch rejected promises.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
