import type { Response } from 'express';
import type { ApiResponse, ApiMeta } from '@swims/shared';

export function sendSuccess<T>(res: Response, data: T, meta?: ApiMeta, status = 200): void {
  const body: ApiResponse<T> = {
    success: true,
    data,
    error: null,
    meta,
  };
  res.status(status).json(body);
}

export function sendCreated<T>(res: Response, data: T, meta?: ApiMeta): void {
  sendSuccess(res, data, meta, 201);
}

export function sendError(res: Response, error: string, status = 500, meta?: ApiMeta): void {
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error,
    meta,
  };
  res.status(status).json(body);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
): void {
  sendSuccess(res, data, {
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
}
