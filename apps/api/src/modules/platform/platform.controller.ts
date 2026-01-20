/**
 * Platform Controller
 * External platform integration endpoints with:
 * - GET /platforms - List all platforms
 * - GET /platforms/:platform - Get platform by name
 * - PATCH /platforms/:platform - Update platform configuration
 * - POST /platforms/:platform/toggle - Toggle platform status
 * - POST /platforms/:platform/sync-orders - Trigger order sync
 * - POST /platforms/:platform/sync-menu - Trigger menu sync
 * - GET /platforms/:platform/logs - Get sync logs
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import { Platform } from '@prisma/client';
import { MigrosAdapter } from './adapters/migros.adapter';

/**
 * DTO for updating platform configuration
 */
class UpdatePlatformDto {
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  isActive?: boolean;
  autoAccept?: boolean;
  commissionRate?: number;
  webhookUrl?: string;
  webhookSecret?: string;
  settings?: Record<string, unknown>;
}

/**
 * DTO for toggling platform status
 */
class TogglePlatformDto {
  isOpen!: boolean;
  reason?: string;
}

/**
 * DTO for storing Migros tokens
 */
class StoreMigrosTokensDto {
  accessToken!: string;
  refreshToken!: string;
  expiration!: string;
}

@ApiTags('Platforms')
@Controller('platforms')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly migrosAdapter: MigrosAdapter,
  ) {}

  /**
   * GET /platforms
   * Get all platform configurations
   */
  @Get()
  @ApiOperation({
    summary: 'Get all platforms',
    description: 'Retrieve all platform configurations with adapter availability',
  })
  @ApiResponse({
    status: 200,
    description: 'Platforms retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          platform: { type: 'string', enum: ['GETIR', 'YEMEKSEPETI', 'TRENDYOL', 'DIRECT', 'POS'] },
          isActive: { type: 'boolean' },
          autoAccept: { type: 'boolean' },
          commissionRate: { type: 'number' },
          lastSyncAt: { type: 'string', format: 'date-time' },
          syncStatus: { type: 'string' },
          adapterAvailable: { type: 'boolean' },
        },
      },
    },
  })
  findAll() {
    return this.platformService.findAll();
  }

  /**
   * GET /platforms/:platform
   * Get platform configuration by platform name
   */
  @Get(':platform')
  @ApiOperation({
    summary: 'Get platform by name',
    description: 'Retrieve a specific platform configuration',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform name',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Platform not configured',
  })
  findByPlatform(
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
  ) {
    return this.platformService.findByPlatform(platform);
  }

  /**
   * PATCH /platforms/:platform
   * Update platform configuration
   */
  @Patch(':platform')
  @ApiOperation({
    summary: 'Update platform configuration',
    description: 'Update API keys, settings, and other platform configuration',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform name',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform configuration updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Platform not configured',
  })
  @Roles('ADMIN')
  updatePlatform(
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
    @Body() updatePlatformDto: UpdatePlatformDto,
  ) {
    return this.platformService.updatePlatform(platform, updatePlatformDto);
  }

  /**
   * POST /platforms/:platform/toggle
   * Toggle platform status (open/close)
   */
  @Post(':platform/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle platform status',
    description: 'Open or close the restaurant on a specific platform',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform name',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform status toggled successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        platform: { type: 'string' },
        isOpen: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to toggle platform status',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  togglePlatform(
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
    @Body() toggleDto: TogglePlatformDto,
  ) {
    return this.platformService.togglePlatform(
      platform,
      toggleDto.isOpen,
      toggleDto.reason,
    );
  }

  /**
   * POST /platforms/:platform/sync-orders
   * Trigger order sync for platform
   */
  @Post(':platform/sync-orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger order sync',
    description: 'Manually trigger order synchronization from platform',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform name',
  })
  @ApiResponse({
    status: 200,
    description: 'Order sync started',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        platform: { type: 'string' },
        jobId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Platform is not active',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  triggerOrderSync(
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
  ) {
    return this.platformService.triggerOrderSync(platform);
  }

  /**
   * POST /platforms/:platform/sync-menu
   * Trigger menu sync for platform
   */
  @Post(':platform/sync-menu')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger menu sync',
    description: 'Manually trigger menu synchronization to platform',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform name',
  })
  @ApiResponse({
    status: 200,
    description: 'Menu sync started',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        platform: { type: 'string' },
        jobId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Platform is not active',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER')
  triggerMenuSync(
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
  ) {
    return this.platformService.triggerMenuSync(platform);
  }

  /**
   * GET /platforms/:platform/logs
   * Get sync logs for platform
   */
  @Get(':platform/logs')
  @ApiOperation({
    summary: 'Get sync logs',
    description: 'Retrieve synchronization logs for a platform',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform name',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'action',
    required: false,
    type: String,
    description: 'Filter by action (sync_orders, sync_menu, toggle_availability)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status (success, failed)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync logs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              platform: { type: 'string' },
              action: { type: 'string' },
              status: { type: 'string' },
              duration: { type: 'number' },
              recordsCount: { type: 'number' },
              errorMessage: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        meta: { type: 'object' },
      },
    },
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  getSyncLogs(
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('action') action?: string,
    @Query('status') status?: string,
  ) {
    return this.platformService.getSyncLogs(platform, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      action,
      status,
    });
  }

  /**
   * POST /platforms/:platform/verify
   * Verify platform API credentials
   */
  @Post(':platform/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify credentials',
    description: 'Verify that the platform API credentials are valid',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform name',
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials verification result',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        platform: { type: 'string' },
      },
    },
  })
  @Roles('ADMIN')
  async verifyCredentials(
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
  ) {
    const valid = await this.platformService.verifyCredentials(platform);
    return { valid, platform };
  }

  /**
   * POST /platforms/migros/store-tokens
   * Store Migros tokens after manual Turnstile login
   */
  @Post('migros/store-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Store Migros tokens',
    description: 'Store JWT tokens obtained from Migros manual login (Turnstile CAPTCHA)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens stored successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @Roles('ADMIN')
  async storeMigrosTokens(@Body() dto: StoreMigrosTokensDto) {
    await this.migrosAdapter.storeTokens(
      dto.accessToken,
      dto.refreshToken,
      dto.expiration,
    );

    return {
      success: true,
      message: 'Migros tokens stored successfully. Sync will start automatically.',
      expiresAt: dto.expiration,
    };
  }
}
