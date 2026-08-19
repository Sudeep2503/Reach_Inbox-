export class ApiError extends Error {
   public readonly statusCode: number;
   public readonly code: string;
   public readonly details: unknown;
   public readonly isOperational: boolean;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code = 'VALIDATION_ERROR', details?: unknown): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message: string, code = 'UNAUTHORIZED'): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(message: string, code = 'FORBIDDEN'): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(message: string, code = 'RESOURCE_NOT_FOUND'): ApiError {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, code = 'CONFLICT'): ApiError {
    return new ApiError(409, code, message);
  }

  static internal(message: string, code = 'INTERNAL_SERVER_ERROR'): ApiError {
    return new ApiError(500, code, message);
  }
}
