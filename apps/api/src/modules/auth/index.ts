/**
 * Auth Module Exports
 *
 * Re-exports all public components from the auth module for easier imports:
 * - AuthModule: Main module to import in app.module.ts
 * - AuthService: For programmatic authentication operations
 * - Guards: For protecting routes
 * - Strategies: For extending authentication
 * - DTOs: For type-safe request handling
 */

// Module
export { AuthModule } from './auth.module';

// Service
export { AuthService } from './auth.service';

// Guards
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { LocalAuthGuard } from './guards/local-auth.guard';
export { RolesGuard } from './guards/roles.guard';

// Strategies
export { JwtStrategy } from './strategies/jwt.strategy';
export { LocalStrategy } from './strategies/local.strategy';

// DTOs
export { LoginDto } from './dto/login.dto';
export { RefreshTokenDto } from './dto/refresh-token.dto';
export { ChangePasswordDto } from './dto/change-password.dto';
