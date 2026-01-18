/**
 * JWT Strategy
 * Validates JWT tokens and extracts user information
 *
 * This strategy:
 * - Extracts JWT from Authorization header (Bearer token)
 * - Validates token signature and expiration
 * - Retrieves and validates user from database
 * - Attaches user data to request object
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';

/** JWT token payload structure */
interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
  branchId?: number;
  iat: number;
  exp: number;
}

/** User data attached to request after validation */
interface ValidatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  branchId: number | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT secret is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Validate JWT payload and retrieve user
   * Called automatically by Passport after token verification
   *
   * @param payload - Decoded JWT payload
   * @returns User data to attach to request
   * @throws UnauthorizedException if user not found or inactive
   */
  async validate(payload: JwtPayload): Promise<ValidatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        branchId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is inactive or suspended');
    }

    // Return user data to be attached to request.user
    return {
      id: user.id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
    };
  }
}
