/**
 * Auth Module
 * Handles authentication, authorization, and session management
 *
 * Features:
 * - JWT-based authentication with access and refresh tokens
 * - Local strategy for email/password login
 * - Role-based access control (RBAC)
 * - Secure refresh token rotation
 * - Password change functionality
 *
 * Token Configuration:
 * - Access Token: 24 hours (configurable via JWT_EXPIRES_IN)
 * - Refresh Token: 30 days (configurable via JWT_REFRESH_EXPIRES_IN)
 */

import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('jwt.secret');
        if (!secret) {
          throw new Error('JWT secret is not configured');
        }
        const expiresIn = configService.get<string>('jwt.expiresIn', '24h');
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    JwtAuthGuard,
    LocalAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, LocalAuthGuard, RolesGuard],
})
export class AuthModule {}
