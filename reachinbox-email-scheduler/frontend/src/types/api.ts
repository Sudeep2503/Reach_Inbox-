export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiCollectionResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}