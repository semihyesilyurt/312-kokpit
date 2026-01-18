/**
 * Current User Decorator
 * Extracts the authenticated user from the request
 *
 * Usage:
 * @CurrentUser() user: CurrentUserData - Get full user object
 * @CurrentUser('id') userId: string - Get specific property
 * @CurrentUser('role') role: UserRole - Get user role
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * User data structure attached to request by JwtStrategy
 */
export interface CurrentUserData {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  branchId?: number | null;
}

/**
 * Parameter decorator to extract current user from request
 *
 * @param data - Optional property name to extract from user
 * @returns Full user object or specific property
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData | undefined;

    if (!user) {
      return undefined;
    }

    if (data) {
      return user[data];
    }

    return user;
  },
);
