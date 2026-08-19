import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/apiError.js';

export function validate(schemas: {
  body?: z.AnyZodObject;
  query?: z.AnyZodObject;
  params?: z.AnyZodObject;
}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as unknown as typeof req.query;
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as unknown as typeof req.params;
      }
      next();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(ApiError.badRequest('Invalid request data', 'VALIDATION_ERROR', details));
      } else {
        next(error);
      }
    }
  };
}
