/**
 * Roles Decorator
 * Specifies required roles for route access
 *
 * Usage:
 * @Roles(UserRole.ADMIN, UserRole.OPERATION_MANAGER)
 * @Roles('ADMIN', 'OPERATION_MANAGER')
 */

import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for accessing a route
 * @param roles - One or more UserRole values required for access
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
