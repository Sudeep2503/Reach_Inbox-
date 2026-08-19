export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page = Math.max(1, parseInt(String(query['page'] ?? ''), 10) || 1);
  let limit = parseInt(String(query['limit'] ?? ''), 10) || 20;
  limit = Math.min(100, Math.max(1, limit));
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

export function getPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
  };
}
