/**
 * Roles Guard
 * Role-based access control (RBAC) for protected routes
 *
 * Features:
 * - Validates user role against required roles from @Roles() decorator
 * - Supports multiple roles (OR logic - any matching role grants access)
 * - Must be used after JwtAuthGuard to have access to user
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('ADMIN', 'OPERATION_MANAGER')
 *
 * Role Hierarchy (from Prisma schema):
 * - ADMIN: Full system access
 * - OPERATION_MANAGER: Operations oversight
 * - BRANCH_MANAGER: Branch-level management
 * - CASHIER: POS and order operations
 * - KITCHEN: Kitchen display and order preparation
 * - COURIER: Delivery operations
 * - ACCOUNTING: Financial reports and data
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/** User data from JWT validation */
interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  branchId?: number | null;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Determine if the request can proceed based on user role
   *
   * @param context - Execution context containing request
   * @returns true if access is granted, throws ForbiddenException otherwise
   */
  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get user from request (set by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    // If no user is attached, deny access
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check if user has any of the required roles
    if (!user.role) {
      throw new ForbiddenException('User role not defined');
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
