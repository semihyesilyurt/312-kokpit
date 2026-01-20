/**
 * Platform Service
 * External platform integration business logic with:
 * - Platform configuration management
 * - Order fetching and synchronization
 * - Menu sync to platforms
 * - Platform toggle (open/close)
 * - Sync logging and monitoring
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { Platform, Prisma } from '@prisma/client';
import {
  PlatformAdapter,
  PlatformOrder,
  RestaurantStatus,
  SyncResult,
} from './adapters/platform-adapter.interface';

/**
 * Map of platform adapters by platform name
 */
type PlatformAdaptersMap = Record<string, PlatformAdapter>;

interface SyncLogsOptions {
  page?: number;
  limit?: number;
  action?: string;
  status?: string;
}

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('platform-sync') private readonly syncQueue: Queue,
    @Inject('PLATFORM_ADAPTERS')
    private readonly adapters: PlatformAdaptersMap,
  ) {}

  /**
   * Get adapter for a specific platform
   */
  private getAdapter(platform: Platform): PlatformAdapter {
    const adapter = this.adapters[platform];
    if (!adapter) {
      throw new BadRequestException(
        `No adapter available for platform: ${platform}`,
      );
    }
    return adapter;
  }

  /**
   * Get all platform configurations
   */
  async findAll() {
    const platforms = await this.prisma.platformConfig.findMany({
      orderBy: { platform: 'asc' },
    });

    // Enrich with adapter availability
    return platforms.map((platform) => ({
      ...platform,
      adapterAvailable: !!this.adapters[platform.platform],
    }));
  }

  /**
   * Get platform configuration by platform name
   */
  async findByPlatform(platform: Platform) {
    const config = await this.prisma.platformConfig.findUnique({
      where: { platform },
    });

    if (!config) {
      throw new NotFoundException(`Platform ${platform} not configured`);
    }

    return {
      ...config,
      adapterAvailable: !!this.adapters[platform],
    };
  }

  /**
   * Update platform configuration
   */
  async updatePlatform(
    platform: Platform,
    data: Partial<{
      apiKey: string;
      apiSecret: string;
      accessToken: string;
      refreshToken: string;
      isActive: boolean;
      autoAccept: boolean;
      commissionRate: number;
      webhookUrl: string;
      webhookSecret: string;
      settings: Record<string, unknown>;
    }>,
  ) {
    await this.findByPlatform(platform);

    const updateData: Prisma.PlatformConfigUpdateInput = {};

    if (data.apiKey !== undefined) updateData.apiKey = data.apiKey;
    if (data.apiSecret !== undefined) updateData.apiSecret = data.apiSecret;
    if (data.accessToken !== undefined) updateData.accessToken = data.accessToken;
    if (data.refreshToken !== undefined) updateData.refreshToken = data.refreshToken;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.autoAccept !== undefined) updateData.autoAccept = data.autoAccept;
    if (data.commissionRate !== undefined)
      updateData.commissionRate = new Prisma.Decimal(data.commissionRate);
    if (data.webhookUrl !== undefined) updateData.webhookUrl = data.webhookUrl;
    if (data.webhookSecret !== undefined) updateData.webhookSecret = data.webhookSecret;
    if (data.settings !== undefined) updateData.settings = data.settings as Prisma.InputJsonValue;

    const updated = await this.prisma.platformConfig.update({
      where: { platform },
      data: updateData,
    });

    this.logger.log(`Platform ${platform} configuration updated`);
    return updated;
  }

  /**
   * Toggle platform status (open/close)
   */
  async togglePlatform(platform: Platform, isOpen: boolean, reason?: string) {
    const config = await this.findByPlatform(platform);
    const adapter = this.getAdapter(platform);

    const startTime = Date.now();

    try {
      // Set status on external platform
      const status: RestaurantStatus = {
        isOpen,
        isBusy: false,
        pauseReason: reason,
      };

      const success = await adapter.setRestaurantStatus(status);

      // Log the sync action
      await this.logSyncAction(platform, 'toggle_availability', success, {
        requestData: { isOpen, reason },
        duration: Date.now() - startTime,
      });

      if (success) {
        // Update local config
        await this.prisma.platformConfig.update({
          where: { platform },
          data: { isActive: isOpen },
        });

        this.logger.log(`Platform ${platform} toggled to ${isOpen ? 'OPEN' : 'CLOSED'}`);
        return {
          success: true,
          platform,
          isOpen,
          message: `Platform ${isOpen ? 'opened' : 'closed'} successfully`,
        };
      }

      throw new BadRequestException(
        `Failed to toggle platform ${platform} status`,
      );
    } catch (error) {
      await this.logSyncAction(platform, 'toggle_availability', false, {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Trigger order sync for a platform
   */
  async triggerOrderSync(platform: Platform) {
    const config = await this.findByPlatform(platform);

    if (!config.isActive) {
      throw new BadRequestException(`Platform ${platform} is not active`);
    }

    const job = await this.syncQueue.add(
      'sync-orders',
      {
        platform,
        triggeredManually: true,
      },
      { priority: 1 },
    );

    this.logger.log(`Order sync triggered for platform: ${platform}`);

    return {
      success: true,
      platform,
      jobId: job.id,
      message: 'Order sync started',
    };
  }

  /**
   * Trigger menu sync for a platform
   */
  async triggerMenuSync(platform: Platform) {
    const config = await this.findByPlatform(platform);

    if (!config.isActive) {
      throw new BadRequestException(`Platform ${platform} is not active`);
    }

    const job = await this.syncQueue.add(
      'sync-menu',
      {
        platform,
        triggeredManually: true,
      },
      { priority: 2 },
    );

    this.logger.log(`Menu sync triggered for platform: ${platform}`);

    return {
      success: true,
      platform,
      jobId: job.id,
      message: 'Menu sync started',
    };
  }

  /**
   * Fetch orders from platform using adapter
   */
  async fetchOrders(platform: Platform): Promise<PlatformOrder[]> {
    const adapter = this.getAdapter(platform);
    return adapter.fetchOrders();
  }

  /**
   * Accept order on platform
   */
  async acceptOrder(
    platform: Platform,
    platformOrderId: string,
    estimatedMinutes?: number,
  ): Promise<boolean> {
    const adapter = this.getAdapter(platform);
    return adapter.acceptOrder(platformOrderId, estimatedMinutes);
  }

  /**
   * Reject order on platform
   */
  async rejectOrder(
    platform: Platform,
    platformOrderId: string,
    reason: string,
  ): Promise<boolean> {
    const adapter = this.getAdapter(platform);
    return adapter.rejectOrder(platformOrderId, reason);
  }

  /**
   * Update order status on platform
   */
  async updateOrderStatus(
    platform: Platform,
    platformOrderId: string,
    status: string,
  ): Promise<boolean> {
    const adapter = this.getAdapter(platform);
    return adapter.updateOrderStatus(platformOrderId, status as any);
  }

  /**
   * Sync menu to platform
   */
  async syncMenu(platform: Platform): Promise<SyncResult> {
    const adapter = this.getAdapter(platform);
    const startTime = Date.now();

    // Get active products
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: { category: true },
    });

    // Transform to platform format
    const platformProducts = products.map((p) => ({
      platformProductId: `${platform}-${p.id}`,
      name: p.name,
      description: p.description || undefined,
      price:
        (p.platformPrices as Record<string, number>)?.[platform] ||
        Number(p.basePrice),
      imageUrl: p.imageUrl || undefined,
      isAvailable: p.isAvailable,
      categoryName: p.category?.name,
    }));

    const result = await adapter.syncMenu(platformProducts);

    // Log the sync
    await this.logSyncAction(
      platform,
      'sync_menu',
      result.success,
      {
        recordsCount: result.recordsCount,
        duration: result.duration,
        errorMessage: result.errorMessage,
      },
    );

    // Update last sync timestamp
    if (result.success) {
      await this.prisma.platformConfig.update({
        where: { platform },
        data: {
          lastSyncAt: new Date(),
          syncStatus: 'success',
          syncError: null,
        },
      });
    } else {
      await this.prisma.platformConfig.update({
        where: { platform },
        data: {
          syncStatus: 'failed',
          syncError: result.errorMessage,
        },
      });
    }

    return result;
  }

  /**
   * Get sync logs for a platform
   */
  async getSyncLogs(platform: Platform, options: SyncLogsOptions = {}) {
    const { page = 1, limit = 50, action, status } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Prisma.PlatformSyncLogWhereInput = { platform };

    if (action) where.action = action;
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      this.prisma.platformSyncLog.findMany({
        skip,
        take,
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.platformSyncLog.count({ where }),
    ]);

    return {
      items: logs,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Log sync action for monitoring
   */
  async logSyncAction(
    platform: Platform,
    action: string,
    success: boolean,
    data: {
      requestData?: unknown;
      responseData?: unknown;
      errorMessage?: string;
      duration?: number;
      recordsCount?: number;
    },
  ) {
    await this.prisma.platformSyncLog.create({
      data: {
        platform,
        action,
        status: success ? 'success' : 'failed',
        requestData: data.requestData as Prisma.InputJsonValue,
        responseData: data.responseData as Prisma.InputJsonValue,
        errorMessage: data.errorMessage,
        duration: data.duration,
        recordsCount: data.recordsCount,
      },
    });
  }

  /**
   * Get all active platforms for scheduled sync
   */
  async getActivePlatforms(): Promise<Platform[]> {
    const configs = await this.prisma.platformConfig.findMany({
      where: { isActive: true },
      select: { platform: true },
    });

    return configs.map((c) => c.platform);
  }

  /**
   * Verify platform credentials
   */
  async verifyCredentials(platform: Platform): Promise<boolean> {
    const adapter = this.getAdapter(platform);
    return adapter.verifyCredentials();
  }
}
