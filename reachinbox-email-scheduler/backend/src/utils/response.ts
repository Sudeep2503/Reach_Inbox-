import type { Response } from 'express';

export function sendSuccess(res: Response, data: unknown, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendCollection(
  res: Response,
  data: unknown[],
  pagination: PaginationMeta,
  statusCode = 200,
) {
  return res.status(statusCode).json({
    success: true,
    data,
    pagination,
  });
}
