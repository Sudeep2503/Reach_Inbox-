import { z } from 'zod';

export const userParamsSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});
