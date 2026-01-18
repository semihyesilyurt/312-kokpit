/**
 * Local Auth Guard
 * Guards login endpoint with local (email/password) strategy
 *
 * This guard:
 * - Triggers Passport local strategy validation
 * - Validates email and password from request body
 * - Attaches user to request on success
 */

import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  /**
   * Handle request after authentication
   * Called by Passport with the result of local strategy validation
   */
  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
    context: ExecutionContext,
  ): TUser {
    // Handle authentication errors
    if (err) {
      throw err;
    }

    // Handle invalid credentials
    if (!user) {
      const message = info?.message || 'Invalid email or password';
      throw new UnauthorizedException(message);
    }

    return user;
  }
}
