/**
 * JWT Auth Guard
 * Protects routes requiring JWT authentication
 *
 * Features:
 * - Validates JWT token from Authorization header
 * - Supports @Public() decorator to skip authentication
 * - Returns 401 Unauthorized for invalid/missing tokens
 */

import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Determine if the request can proceed
   * Checks for @Public() decorator first, then validates JWT
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Proceed with JWT validation
    return super.canActivate(context);
  }

  /**
   * Handle request after authentication
   * Called by Passport with the result of JWT validation
   */
  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
  ): TUser {
    // Handle authentication errors
    if (err) {
      throw err;
    }

    // Handle missing or invalid token
    if (!user) {
      const message = info?.message || 'Authentication required';
      throw new UnauthorizedException(message);
    }

    return user;
  }
}
