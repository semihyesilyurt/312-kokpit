/**
 * Yemeksepeti Partner Portal Sync Scheduler
 * High-frequency order polling (every 10 seconds) specifically for Yemeksepeti platform
 * Handles session persistence and real-time order synchronization
 *
 * Note: Yemeksepeti uses PerimeterX bot protection, so initial login must be done
 * via Playwright script: node /www/wwwroot/312/scr/yemeksepeti/hybrid-login.js
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { Platform, Prisma } from '@prisma/client';
import { YemeksepetiAdapter } from './adapters/yemeksepeti.adapter';
import { OrderService } from '@modules/order/order.service';
import { OrderGateway } from '@modules/order/order.gateway';
import { PlatformOrder } from './adapters/platform-adapter.interface';

/**
 * Yemeksepeti commission rate (35%)
 */
const YEMEKSEPETI_COMMISSION_RATE = 35;

@Injectable()
export class YemeksepetiSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(YemeksepetiSyncScheduler.name);
  private isSyncing = false;
  private isEnabled = false;
  private syncCount = 0;
  private lastSyncTime: Date | null = null;
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 5;

  // Track processed order IDs to avoid duplicates
  private processedOrderIds: Set<string> = new Set();
  private readonly maxProcessedOrdersCache = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly yemeksepetiAdapter: YemeksepetiAdapter,
    private readonly orderService: OrderService,
    private readonly orderGateway: OrderGateway,
    @InjectQueue('platform-sync') private readonly syncQueue: Queue,
  ) {}

  /**
   * Initialize scheduler on module start
   */
  async onModuleInit() {
    await this.checkYemeksepetiEnabled();
    this.logger.log(`Yemeksepeti sync scheduler initialized. Enabled: ${this.isEnabled}`);
  }

  /**
   * Check if Yemeksepeti platform is enabled and has valid credentials
   */
  private async checkYemeksepetiEnabled(): Promise<boolean> {
    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.YEMEKSEPETI },
      });

      this.isEnabled = !!(config?.isActive && config?.accessToken);

      if (!this.isEnabled) {
        this.logger.debug('Yemeksepeti platform is not active or missing credentials');
      }

      return this.isEnabled;
    } catch (error) {
      this.logger.error(`Error checking Yemeksepeti status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * High-frequency Yemeksepeti order sync - every 10 seconds
   * This ensures near real-time order visibility
   */
  @Cron('*/10 * * * * *') // Every 10 seconds
  async syncYemeksepetiOrders() {
    // Skip if already syncing or disabled
    if (this.isSyncing) {
      this.logger.debug('Yemeksepeti sync already in progress, skipping...');
      return;
    }

    // Re-check if Yemeksepeti is enabled periodically (every 5 minutes = 30 * 10 seconds)
    if (this.syncCount % 30 === 0) {
      await this.checkYemeksepetiEnabled();
    }

    if (!this.isEnabled) {
      return;
    }

    // Circuit breaker: Stop syncing after too many consecutive errors
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      this.logger.warn(`Yemeksepeti sync paused due to ${this.consecutiveErrors} consecutive errors. Will retry in 5 minutes.`);

      // Reset after 5 minutes (30 cycles of 10 seconds)
      if (this.syncCount % 30 === 0) {
        this.consecutiveErrors = 0;
        this.logger.log('Yemeksepeti sync circuit breaker reset');
      }
      return;
    }

    this.isSyncing = true;
    this.syncCount++;
    const startTime = Date.now();

    try {
      this.logger.debug(`Starting Yemeksepeti order sync #${this.syncCount}`);

      // Fetch orders from Yemeksepeti
      const platformOrders = await this.yemeksepetiAdapter.fetchOrders();

      if (platformOrders.length === 0) {
        this.logger.debug('No active orders from Yemeksepeti');
        this.consecutiveErrors = 0; // Reset on success
        this.lastSyncTime = new Date();
        return;
      }

      // Process each order
      let ordersCreated = 0;
      let ordersUpdated = 0;

      for (const platformOrder of platformOrders) {
        try {
          const result = await this.processOrder(platformOrder);
          if (result === 'created') {
            ordersCreated++;
          } else if (result === 'updated') {
            ordersUpdated++;
          }
        } catch (error) {
          this.logger.error(
            `Error processing Yemeksepeti order ${platformOrder.platformOrderId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      // Log sync result
      const duration = Date.now() - startTime;
      this.consecutiveErrors = 0; // Reset on success
      this.lastSyncTime = new Date();

      if (ordersCreated > 0 || ordersUpdated > 0) {
        this.logger.log(
          `Yemeksepeti sync #${this.syncCount} completed in ${duration}ms: ${ordersCreated} created, ${ordersUpdated} updated`,
        );

        // Log to database
        await this.logSyncAction(true, {
          ordersCreated,
          ordersUpdated,
          totalFetched: platformOrders.length,
          duration,
        });
      }

      // Clean up old processed order IDs cache
      if (this.processedOrderIds.size > this.maxProcessedOrdersCache) {
        const idsArray = Array.from(this.processedOrderIds);
        this.processedOrderIds = new Set(idsArray.slice(-500));
      }
    } catch (error) {
      this.consecutiveErrors++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Yemeksepeti sync #${this.syncCount} failed: ${errorMsg}`);

      // Log failure to database
      await this.logSyncAction(false, {
        errorMessage: errorMsg,
        duration: Date.now() - startTime,
      });

      // If authentication error, trigger automatic re-login
      if (errorMsg.includes('Authentication failed') || errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('token expired')) {
        this.isEnabled = false;
        this.logger.warn('Yemeksepeti sync disabled due to authentication failure. Triggering automatic re-login...');

        await this.prisma.platformConfig.update({
          where: { platform: Platform.YEMEKSEPETI },
          data: {
            syncStatus: 'auth_failed',
            syncError: 'Session expired. Automatic re-login in progress...',
          },
        });

        // Trigger automatic re-login after 30 seconds
        setTimeout(async () => {
          this.logger.log('Attempting automatic Yemeksepeti re-login...');
          const success = await this.yemeksepetiAdapter.performAutomaticLogin();
          if (success) {
            this.isEnabled = true;
            this.consecutiveErrors = 0;
            this.logger.log('Yemeksepeti automatic re-login successful');
          } else {
            this.logger.error('Yemeksepeti automatic re-login failed');
          }
        }, 30000);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process a single order from Yemeksepeti
   * Returns 'created', 'updated', or 'skipped'
   * - New orders: Create in DB
   * - Existing orders: Sync status from platform to DB (except DELIVERED/CANCELLED)
   */
  private async processOrder(platformOrder: PlatformOrder): Promise<'created' | 'updated' | 'skipped'> {
    // Check if already processed in this session
    if (this.processedOrderIds.has(platformOrder.platformOrderId)) {
      return 'skipped';
    }

    // Check if order already exists in database
    const existingOrder = await this.prisma.order.findFirst({
      where: {
        platformOrderId: platformOrder.platformOrderId,
        platform: Platform.YEMEKSEPETI,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        branchId: true,
        customerNote: true,
      },
    });

    if (existingOrder) {
      // Order exists - sync status from platform if not in final state
      const finalStatuses = ['DELIVERED', 'CANCELLED'];
      let updated = false;

      // Update customer note if missing
      if (!existingOrder.customerNote && platformOrder.customer.note) {
        await this.prisma.order.update({
          where: { id: existingOrder.id },
          data: { customerNote: platformOrder.customer.note },
        });
        this.logger.log(`Updated order ${existingOrder.orderNumber} with customer note`);
        updated = true;
      }

      // Sync status from platform if not in final state
      if (!finalStatuses.includes(existingOrder.status)) {
        const platformStatus = platformOrder.platformStatus;
        if (platformStatus && platformStatus !== existingOrder.status) {
          // Update DB status to match platform status
          await this.prisma.order.update({
            where: { id: existingOrder.id },
            data: { status: platformStatus },
          });

          // Create status history entry
          await this.prisma.orderStatusHistory.create({
            data: {
              orderId: existingOrder.id,
              fromStatus: existingOrder.status,
              toStatus: platformStatus,
              note: 'Status synced from Yemeksepeti platform',
            },
          });

          // Emit status update via WebSocket for Kanban
          this.orderGateway.emitOrderStatusChanged(
            String(existingOrder.branchId),
            existingOrder.id,
            platformStatus,
            existingOrder.status,
          );

          this.logger.log(
            `Yemeksepeti order ${existingOrder.orderNumber} status updated: ${existingOrder.status} → ${platformStatus}`,
          );

          updated = true;
        }
      }

      this.processedOrderIds.add(platformOrder.platformOrderId);
      return updated ? 'updated' : 'skipped';
    }

    // Create new order
    const order = await this.createOrder(platformOrder);

    // Mark as processed
    this.processedOrderIds.add(platformOrder.platformOrderId);

    // Emit real-time notification
    this.orderGateway.emitNewOrder(String(order.branchId), {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      platform: order.platform,
      customerName: order.customerName,
      totalAmount: Number(order.totalAmount),
      branchId: order.branchId,
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
      })),
    });

    this.logger.log(`🔔 New Yemeksepeti order created: ${order.orderNumber} (Platform ID: ${platformOrder.platformOrderId})`);

    return 'created';
  }

  /**
   * Create order from Yemeksepeti platform order
   */
  private async createOrder(platformOrder: PlatformOrder) {
    // Generate order number
    const orderNumber = await this.orderService.generateOrderNumber();

    // Find or create customer
    let customer = await this.prisma.customer.findUnique({
      where: { phone: platformOrder.customer.phone },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          phone: platformOrder.customer.phone,
          name: platformOrder.customer.name,
          defaultAddress: platformOrder.customer.address,
          defaultLatitude: platformOrder.customer.latitude
            ? new Prisma.Decimal(platformOrder.customer.latitude)
            : null,
          defaultLongitude: platformOrder.customer.longitude
            ? new Prisma.Decimal(platformOrder.customer.longitude)
            : null,
          firstOrderPlatform: Platform.YEMEKSEPETI,
          isDirectCustomer: false,
          firstOrderAt: new Date(),
          status: 'ACTIVE',
        },
      });
    }

    // Map products to order items
    const itemsData = [];
    for (const item of platformOrder.items) {
      // Ensure numeric values have safe defaults
      const safeUnitPrice = item.unitPrice ?? 0;
      const safeQuantity = item.quantity ?? 1;
      const totalPrice = safeUnitPrice * safeQuantity;

      // Try to find product by name
      const product = await this.prisma.product.findFirst({
        where: {
          OR: [
            { name: { contains: item.name?.split(' ').slice(0, 2).join(' ') || '' } },
            { name: item.name || '' },
          ],
        },
      });

      if (product) {
        const cost = Number(product.cost || 0) * safeQuantity;
        itemsData.push({
          productId: product.id,
          productName: product.name,
          quantity: safeQuantity,
          unitPrice: new Prisma.Decimal(safeUnitPrice),
          totalPrice: new Prisma.Decimal(totalPrice),
          cost: new Prisma.Decimal(cost),
          notes: item.notes,
        });
      } else {
        // Create with default product ID 1 if no match found
        itemsData.push({
          productId: 1,
          productName: item.name || 'Bilinmeyen Ürün',
          quantity: safeQuantity,
          unitPrice: new Prisma.Decimal(safeUnitPrice),
          totalPrice: new Prisma.Decimal(totalPrice),
          cost: new Prisma.Decimal(0),
          notes: item.notes,
        });
      }
    }

    // Ensure order totals have safe defaults
    const safeSubtotal = platformOrder.subtotal ?? 0;
    const safeTotalAmount = platformOrder.totalAmount ?? 0;
    const safeDiscount = platformOrder.discount ?? 0;
    const safeDeliveryFee = platformOrder.deliveryFee ?? 0;

    // Calculate commission (Yemeksepeti ~35%)
    const platformCommission = Number(
      ((safeSubtotal * YEMEKSEPETI_COMMISSION_RATE) / 100).toFixed(2),
    );
    const netAmount = safeTotalAmount - platformCommission;

    // Get default branch
    const branch = await this.prisma.branch.findFirst({
      where: { isActive: true },
    });

    if (!branch) {
      throw new Error('No active branch found');
    }

    // Calculate estimated delivery
    let estimatedDelivery: Date | null = null;
    if (platformOrder.estimatedDeliveryMinutes) {
      estimatedDelivery = new Date();
      estimatedDelivery.setMinutes(
        estimatedDelivery.getMinutes() + platformOrder.estimatedDeliveryMinutes,
      );
    }

    // Create order with items
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        platform: Platform.YEMEKSEPETI,
        platformOrderId: platformOrder.platformOrderId,
        platformDisplayId: platformOrder.platformDisplayId,
        status: 'PENDING',
        customerId: customer.id,
        customerName: platformOrder.customer.name,
        customerPhone: platformOrder.customer.phone,
        customerAddress: platformOrder.customer.address,
        customerNote: platformOrder.customer.note,
        latitude: platformOrder.customer.latitude
          ? new Prisma.Decimal(platformOrder.customer.latitude)
          : null,
        longitude: platformOrder.customer.longitude
          ? new Prisma.Decimal(platformOrder.customer.longitude)
          : null,
        subtotal: new Prisma.Decimal(safeSubtotal),
        discount: new Prisma.Decimal(safeDiscount),
        deliveryFee: new Prisma.Decimal(safeDeliveryFee),
        platformCommission: new Prisma.Decimal(platformCommission),
        totalAmount: new Prisma.Decimal(safeTotalAmount),
        netAmount: new Prisma.Decimal(netAmount),
        paymentMethod: platformOrder.paymentMethod,
        paymentStatus: platformOrder.paymentMethod === 'ONLINE' ? 'PAID' : 'PENDING',
        branchId: branch.id,
        estimatedDelivery,
        items: {
          create: itemsData,
        },
      },
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    // Create initial status history
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: 'PENDING',
        note: 'Order imported from Yemeksepeti Partner Portal',
      },
    });

    // Update customer totals
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: { increment: 1 },
        totalSpent: { increment: new Prisma.Decimal(safeTotalAmount) },
        lastOrderAt: new Date(),
      },
    });

    return order;
  }

  /**
   * Log sync action to database
   */
  private async logSyncAction(
    success: boolean,
    data: {
      ordersCreated?: number;
      ordersUpdated?: number;
      totalFetched?: number;
      duration?: number;
      errorMessage?: string;
    },
  ) {
    try {
      await this.prisma.platformSyncLog.create({
        data: {
          platform: Platform.YEMEKSEPETI,
          action: 'sync_orders_10s',
          status: success ? 'success' : 'failed',
          responseData: {
            ordersCreated: data.ordersCreated,
            ordersUpdated: data.ordersUpdated,
            totalFetched: data.totalFetched,
          } as Prisma.InputJsonValue,
          errorMessage: data.errorMessage,
          duration: data.duration,
          recordsCount: data.ordersCreated ?? 0,
        },
      });

      // Update last sync timestamp
      if (success) {
        await this.prisma.platformConfig.update({
          where: { platform: Platform.YEMEKSEPETI },
          data: {
            lastSyncAt: new Date(),
            syncStatus: 'success',
            syncError: null,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to log sync action: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Session refresh check - runs every hour
   * Proactively refreshes token before expiration via automatic login
   */
  @Cron('0 0 * * * *') // Every hour at minute 0
  async checkSessionRefresh() {
    try {
      this.logger.debug('Checking Yemeksepeti session status...');

      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.YEMEKSEPETI },
      });

      // If no token or config, trigger automatic login
      if (!config?.accessToken) {
        this.logger.log('No Yemeksepeti token found, triggering automatic login...');
        await this.yemeksepetiAdapter.performAutomaticLogin();
        await this.checkYemeksepetiEnabled();
        return;
      }

      // Check if token will expire in the next 30 minutes
      if (config.tokenExpiresAt) {
        const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);

        if (config.tokenExpiresAt < thirtyMinutesFromNow) {
          this.logger.log('Yemeksepeti token expiring soon, triggering proactive re-login...');

          const success = await this.yemeksepetiAdapter.performAutomaticLogin();
          await this.checkYemeksepetiEnabled();

          if (success) {
            this.logger.log('Yemeksepeti proactive re-login successful');
          } else {
            this.logger.warn('Yemeksepeti proactive re-login failed, will retry on next sync error');
          }
        } else {
          const remainingMinutes = Math.round((config.tokenExpiresAt.getTime() - Date.now()) / 60000);
          this.logger.debug(`Yemeksepeti token valid for ${remainingMinutes} more minutes`);
        }
      }
    } catch (error) {
      this.logger.error(`Session refresh check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initial session load on startup - runs 50 seconds after module init
   * Triggers automatic login if no valid session exists
   */
  @Cron('50 * * * * *', { name: 'yemeksepeti-initial-session-load' }) // At second 50 of every minute
  async initialSessionLoad() {
    // Only run once at startup
    if (this.syncCount > 0) {
      return;
    }

    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.YEMEKSEPETI },
      });

      if (!config?.accessToken || !config?.tokenExpiresAt || config.tokenExpiresAt < new Date()) {
        this.logger.log('Yemeksepeti: No valid session, triggering automatic login...');
        await this.yemeksepetiAdapter.performAutomaticLogin();
        await this.checkYemeksepetiEnabled();
      } else {
        // Session exists, just load it
        await this.yemeksepetiAdapter.checkAndRefreshLogin();
        await this.checkYemeksepetiEnabled();
      }
    } catch (error) {
      this.logger.error(`Initial session load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get sync statistics
   */
  getSyncStats() {
    return {
      isEnabled: this.isEnabled,
      isSyncing: this.isSyncing,
      syncCount: this.syncCount,
      lastSyncTime: this.lastSyncTime,
      consecutiveErrors: this.consecutiveErrors,
      processedOrdersCount: this.processedOrderIds.size,
    };
  }

  /**
   * Force enable sync (for manual override)
   */
  async forceEnable(): Promise<void> {
    this.isEnabled = true;
    this.consecutiveErrors = 0;
    this.logger.log('Yemeksepeti sync force-enabled');
  }

  /**
   * Force disable sync
   */
  forceDisable(): void {
    this.isEnabled = false;
    this.logger.log('Yemeksepeti sync force-disabled');
  }

  /**
   * Trigger manual sync
   */
  async triggerManualSync(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: 'Sync already in progress' };
    }

    this.logger.log('Triggering manual Yemeksepeti sync...');
    await this.syncYemeksepetiOrders();

    return {
      success: true,
      message: `Manual sync completed. ${this.processedOrderIds.size} orders processed in this session.`,
    };
  }

  /**
   * Trigger automatic Playwright login with Xvfb
   */
  async triggerPlaywrightLogin(): Promise<{ success: boolean; message: string }> {
    this.logger.log('Triggering automatic Yemeksepeti login with Xvfb...');

    const success = await this.yemeksepetiAdapter.performAutomaticLogin();

    if (success) {
      this.isEnabled = true;
      this.consecutiveErrors = 0;
      await this.checkYemeksepetiEnabled();
      return {
        success: true,
        message: 'Yemeksepeti automatic login completed successfully',
      };
    }

    return {
      success: false,
      message: 'Yemeksepeti automatic login failed. Check logs for details.',
    };
  }
}
