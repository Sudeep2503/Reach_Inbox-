import type { User } from '@prisma/client';

export type UserResponse = User;
export type UserResponseWithoutGoogle = Omit<User, 'googleId'>;
