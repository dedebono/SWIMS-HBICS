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
  // Body-parser rejections. `express.json({ limit })` throws these BEFORE any
  // route handler runs, so without this branch an oversized upload surfaced as
  // a generic 500 ("request entity too large") instead of telling the user the
  // file was rejected. For base64 image payloads the inflated size is expected —
  // a 1 MB photo encodes to ~1.37 MB — so the message names the real cause.
  const bodyParserCode = (err as { type?: string; status?: number }).type;
  if (bodyParserCode === 'entity.too.large') {
    sendError(
      res,
      'Berkas terlalu besar untuk diproses. Maksimal 1 MB untuk foto profil.',
      413,
    );
    return;
  }
  if (bodyParserCode === 'entity.parse.failed') {
    sendError(res, 'Format permintaan tidak valid.', 400);
    return;
  }

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
