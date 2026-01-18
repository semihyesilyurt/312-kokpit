/**
 * Local Strategy
 * Validates username/password credentials for login
 *
 * This strategy:
 * - Uses email as the username field
 * - Validates credentials against database
 * - Returns user data on success for JWT token generation
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

/** Authenticated user data returned on successful validation */
interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: string;
  branchId?: number | null;
}

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  /**
   * Validate user credentials
   * Called automatically by Passport on login attempt
   *
   * @param email - User email address
   * @param password - User password (plain text)
   * @returns Authenticated user data
   * @throws UnauthorizedException if credentials are invalid
   */
  async validate(email: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.authService.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }
}
