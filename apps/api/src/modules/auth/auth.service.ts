/**
 * Auth Service
 * Authentication business logic with secure token management
 *
 * Features:
 * - Email/password validation with bcrypt
 * - JWT access token generation (15m expiry)
 * - Refresh token management with rotation (7d expiry)
 * - Secure password change with verification
 * - User session management
 *
 * Security:
 * - Passwords hashed with bcrypt (10 rounds)
 * - Refresh tokens stored hashed in database
 * - Token rotation on refresh to prevent reuse
 * - Audit logging for security events
 */

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';

/** JWT payload structure - uses plain serializable types */
interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  branchId?: number;
}

/** Response structure for authentication tokens */
export interface TokenResponse {
  user: {
    id: number;
    email: string;
    name: string;
    role: UserRole;
    branchId: number | null;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

/** Authenticated user data for login - input to login method */
export interface AuthenticatedUserInput {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  branchId?: number | null;
}

/** Bcrypt salt rounds for password hashing */
const BCRYPT_SALT_ROUNDS = 10;

/** Minimum password length requirement */
const MIN_PASSWORD_LENGTH = 6;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validate user credentials for login
   * @param email - User email address
   * @param password - Plain text password
   * @returns User data without password if valid, null otherwise
   */
  async validateUser(email: string, password: string): Promise<AuthenticatedUserInput | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        role: true,
        status: true,
        branchId: true,
      },
    });

    if (!user) {
      this.logger.warn(`Login attempt for non-existent user: ${email}`);
      return null;
    }

    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn(`Login attempt for inactive/suspended user: ${email} (status: ${user.status})`);
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Invalid password attempt for user: ${email}`);
      return null;
    }

    // Return user data without password
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
    };
  }

  /**
   * Generate tokens and create login session
   * @param user - Authenticated user data
   * @returns Access token, refresh token, and user info
   */
  async login(user: AuthenticatedUserInput): Promise<TokenResponse> {
    // Create payload as a plain object for JWT signing
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role as string,
      branchId: user.branchId ?? undefined,
    };

    // Generate access token
    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token with separate secret and longer expiry
    const refreshTokenExpiry = this.configService.get<string>('jwt.refreshExpiresIn', '7d');
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: refreshTokenExpiry as JwtSignOptions['expiresIn'],
    });

    // Calculate refresh token expiry date
    const expiresAt = this.calculateExpiryDate(refreshTokenExpiry);

    // Store hashed refresh token in database
    const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);

    // Revoke any existing refresh tokens for this user and create new one
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
      this.prisma.refreshToken.create({
        data: {
          token: hashedRefreshToken,
          userId: user.id,
          expiresAt,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    this.logger.log(`User logged in successfully: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId ?? null,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.getExpiresInSeconds(),
      },
    };
  }

  /**
   * Refresh access token using a valid refresh token
   * Implements token rotation for security
   * @param refreshToken - Current refresh token
   * @returns New access token and refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      // Verify the refresh token
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      // Find the user and validate
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          branchId: true,
          refreshTokens: {
            where: {
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('User not found or inactive');
      }

      if (user.refreshTokens.length === 0) {
        throw new UnauthorizedException('No valid refresh token found');
      }

      // Verify the refresh token matches the stored hash
      const storedToken = user.refreshTokens[0];
      const isValidToken = await bcrypt.compare(refreshToken, storedToken.token);

      if (!isValidToken) {
        // Potential token reuse attack - revoke all tokens
        await this.prisma.refreshToken.updateMany({
          where: { userId: user.id },
          data: { revokedAt: new Date() },
        });

        this.logger.error(`Potential refresh token reuse detected for user: ${user.email}`);
        throw new UnauthorizedException('Invalid refresh token - all sessions revoked');
      }

      // Token rotation: revoke current token and issue new ones
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      // Issue new tokens
      return this.login({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn(`Refresh token validation failed: ${error}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user and invalidate refresh tokens
   * @param userId - User ID
   * @returns Success message
   */
  async logout(userId: string): Promise<{ message: string }> {
    const userIdNum = parseInt(userId, 10);

    // Revoke all refresh tokens for the user
    await this.prisma.refreshToken.updateMany({
      where: {
        userId: userIdNum,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logout successful' };
  }

  /**
   * Get user profile by ID
   * @param userId - User ID
   * @returns User profile data
   */
  async getProfile(userId: string) {
    const userIdNum = parseInt(userId, 10);

    const user = await this.prisma.user.findUnique({
      where: { id: userIdNum },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Change user password
   * @param userId - User ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   * @returns Success message
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const userIdNum = parseInt(userId, 10);

    // Get user with current password
    const user = await this.prisma.user.findUnique({
      where: { id: userIdNum },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    // Update password and revoke all refresh tokens
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userIdNum },
        data: { password: hashedPassword },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: userIdNum,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    this.logger.log(`Password changed for user: ${user.email}`);
    return { message: 'Password changed successfully' };
  }

  /**
   * Calculate expiry date from duration string
   * @param duration - Duration string (e.g., '15m', '7d', '1h')
   * @returns Expiry date
   */
  private calculateExpiryDate(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      // Default to 7 days if parsing fails
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * (multipliers[unit] || 24 * 60 * 60 * 1000));
  }

  /**
   * Get access token expiry in seconds
   * @returns Expiry time in seconds
   */
  private getExpiresInSeconds(): number {
    const expiresIn = this.configService.get<string>('jwt.expiresIn', '15m');
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * (multipliers[unit] || 60);
  }
}
