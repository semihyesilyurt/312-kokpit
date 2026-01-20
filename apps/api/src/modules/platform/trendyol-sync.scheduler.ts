/**
 * Trendyol GO Yemek Sync Scheduler
 * High-frequency order polling (every 10 seconds) specifically for Trendyol platform
 * Handles JWT token refresh and real-time order synchronization
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { Platform, Prisma } from '@prisma/client';
import { TrendyolAdapter } from './adapters/trendyol.adapter';
import { OrderService } from '@modules/order/order.service';
import { OrderGateway } from '@modules/order/order.gateway';
import { PlatformOrder } from './adapters/platform-adapter.interface';

/**
 * Trendyol commission rate (20%)
 */
const TRENDYOL_COMMISSION_RATE = 20;

@Injectable()
export class TrendyolSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(TrendyolSyncScheduler.name);
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
    private readonly trendyolAdapter: TrendyolAdapter,
    private readonly orderService: OrderService,
    private readonly orderGateway: OrderGateway,
    @InjectQueue('platform-sync') private readonly syncQueue: Queue,
  ) {}

  /**
   * Initialize scheduler on module start
   */
  async onModuleInit() {
    await this.checkTrendyolEnabled();
    this.logger.log(`Trendyol sync scheduler initialized. Enabled: ${this.isEnabled}`);
  }

  /**
   * Check if Trendyol platform is enabled and has valid credentials
   */
  private async checkTrendyolEnabled(): Promise<boolean> {
    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.TRENDYOL },
      });

      this.isEnabled = !!(config?.isActive && config?.accessToken);

      if (!this.isEnabled) {
        this.logger.debug('Trendyol platform is not active or missing credentials');
      }

      return this.isEnabled;
    } catch (error) {
      this.logger.error(`Error checking Trendyol status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * High-frequency Trendyol order sync - every 10 seconds
   * This ensures near real-time order visibility
   */
  @Cron('*/10 * * * * *') // Every 10 seconds
  async syncTrendyolOrders() {
    // Skip if already syncing or disabled
    if (this.isSyncing) {
      this.logger.debug('Trendyol sync already in progress, skipping...');
      return;
    }

    // Re-check if Trendyol is enabled periodically (every 5 minutes = 30 * 10 seconds)
    if (this.syncCount % 30 === 0) {
      await this.checkTrendyolEnabled();
    }

    if (!this.isEnabled) {
      return;
    }

    // Circuit breaker: Stop syncing after too many consecutive errors
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      this.logger.warn(`Trendyol sync paused due to ${this.consecutiveErrors} consecutive errors. Will retry in 5 minutes.`);

      // Reset after 5 minutes (30 cycles of 10 seconds)
      if (this.syncCount % 30 === 0) {
        this.consecutiveErrors = 0;
        this.logger.log('Trendyol sync circuit breaker reset');
      }
      return;
    }

    this.isSyncing = true;
    this.syncCount++;
    const startTime = Date.now();

    try {
      this.logger.debug(`Starting Trendyol order sync #${this.syncCount}`);

      // Fetch orders from Trendyol
      const platformOrders = await this.trendyolAdapter.fetchOrders();

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
            `Error processing Trendyol order ${platformOrder.platformOrderId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      // ALWAYS check for delivered orders, even when platform returns empty list
      // Orders that disappeared from Trendyol active list are considered delivered
      const deliveredCount = await this.checkDeliveredOrders(platformOrders);

      // Log sync result
      const duration = Date.now() - startTime;
      this.consecutiveErrors = 0; // Reset on success
      this.lastSyncTime = new Date();

      if (ordersCreated > 0 || ordersUpdated > 0 || deliveredCount > 0) {
        this.logger.log(
          `Trendyol sync #${this.syncCount} completed in ${duration}ms: ${ordersCreated} created, ${ordersUpdated} updated, ${deliveredCount} delivered`,
        );

        // Log to database
        await this.logSyncAction(true, {
          ordersCreated,
          ordersUpdated,
          ordersDelivered: deliveredCount,
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

      this.logger.error(`Trendyol sync #${this.syncCount} failed: ${errorMsg}`);

      // Log failure to database
      await this.logSyncAction(false, {
        errorMessage: errorMsg,
        duration: Date.now() - startTime,
      });

      // If authentication error, disable until re-authenticated
      if (errorMsg.includes('Authentication failed') || errorMsg.includes('401')) {
        this.isEnabled = false;
        this.logger.warn('Trendyol sync disabled due to authentication failure. Manual login required.');

        await this.prisma.platformConfig.update({
          where: { platform: Platform.TRENDYOL },
          data: {
            syncStatus: 'auth_failed',
            syncError: 'JWT token expired. Automatic re-login will be attempted.',
          },
        });

        // Try to re-login automatically
        setTimeout(async () => {
          this.logger.log('Attempting automatic Trendyol re-login...');
          const success = await this.trendyolAdapter.performAutomaticLogin();
          if (success) {
            this.isEnabled = true;
            this.consecutiveErrors = 0;
            this.logger.log('Trendyol automatic re-login successful');
          }
        }, 30000); // Wait 30 seconds before retry
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process a single order from Trendyol
   * Returns 'created', 'updated', or 'skipped'
   * - New orders: Create in DB
   * - Existing orders: Sync status from platform to DB (except DELIVERED/CANCELLED)
   */
  private async processOrder(platformOrder: PlatformOrder): Promise<'created' | 'updated' | 'skipped'> {
    // Check if order already exists in database
    const existingOrder = await this.prisma.order.findFirst({
      where: {
        platformOrderId: platformOrder.platformOrderId,
        platform: Platform.TRENDYOL,
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
        this.logger.debug(
          `Order ${existingOrder.orderNumber}: DB=${existingOrder.status}, Platform=${platformStatus}`,
        );
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
              note: 'Status synced from Trendyol platform',
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
            `Trendyol order ${existingOrder.orderNumber} status updated: ${existingOrder.status} → ${platformStatus}`,
          );

          updated = true;
        }
      }

      // Don't add to processedOrderIds for existing orders - allow continuous status sync
      return updated ? 'updated' : 'skipped';
    }

    // Check if already being created in this sync cycle (prevent race condition duplicates)
    if (this.processedOrderIds.has(platformOrder.platformOrderId)) {
      return 'skipped';
    }

    // Mark as being processed BEFORE creating to prevent duplicates
    this.processedOrderIds.add(platformOrder.platformOrderId);

    // Create new order
    const order = await this.createOrder(platformOrder);

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

    this.logger.log(`🔔 New Trendyol order created: ${order.orderNumber} (Platform ID: ${platformOrder.platformOrderId})`);

    return 'created';
  }

  /**
   * Check for delivered orders
   * Orders that are ON_DELIVERY in DB but no longer in Trendyol active list are considered delivered
   */
  private async checkDeliveredOrders(platformOrders: PlatformOrder[]): Promise<number> {
    // Get all active platform order IDs from current sync
    const activePlatformOrderIds = new Set(platformOrders.map(o => o.platformOrderId));

    // Find DB orders that are active but not in platform list (they've been delivered)
    const potentiallyDelivered = await this.prisma.order.findMany({
      where: {
        platform: Platform.TRENDYOL,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_DELIVERY'] },
        // Only check orders created in the last 24 hours
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        orderNumber: true,
        platformOrderId: true,
        status: true,
        branchId: true,
      },
    });

    let deliveredCount = 0;

    for (const order of potentiallyDelivered) {
      // If order is not in active list, it's been delivered (or cancelled)
      if (order.platformOrderId && !activePlatformOrderIds.has(order.platformOrderId)) {
        // Update to DELIVERED
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'DELIVERED',
            deliveredAt: new Date(),
          },
        });

        // Create status history
        await this.prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'DELIVERED',
            note: 'Order delivered (no longer in Trendyol active list)',
          },
        });

        // Emit WebSocket update
        this.orderGateway.emitOrderStatusChanged(
          String(order.branchId),
          order.id,
          'DELIVERED',
          order.status,
        );

        this.logger.log(`Trendyol order ${order.orderNumber} marked as DELIVERED (disappeared from active list)`);
        deliveredCount++;
      }
    }

    return deliveredCount;
  }

  /**
   * Create order from Trendyol platform order
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
          firstOrderPlatform: Platform.TRENDYOL,
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

    // Calculate commission (Trendyol ~20%)
    const platformCommission = Number(
      ((safeSubtotal * TRENDYOL_COMMISSION_RATE) / 100).toFixed(2),
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
        platform: Platform.TRENDYOL,
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
        paymentStatus: platformOrder.paymentMethod !== 'CASH' ? 'PAID' : 'PENDING', // Trendyol: online card = PAID
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
        note: 'Order imported from Trendyol GO Yemek',
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
      ordersDelivered?: number;
      totalFetched?: number;
      duration?: number;
      errorMessage?: string;
    },
  ) {
    try {
      await this.prisma.platformSyncLog.create({
        data: {
          platform: Platform.TRENDYOL,
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
          where: { platform: Platform.TRENDYOL },
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
   * Token refresh check - runs every hour
   * Proactively refreshes token before expiration via automatic login
   */
  @Cron('0 0 * * * *') // Every hour at minute 0
  async checkTokenRefresh() {
    try {
      this.logger.debug('Checking Trendyol token status...');

      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.TRENDYOL },
      });

      // If no token or config, attempt login
      if (!config?.accessToken) {
        this.logger.log('No Trendyol token found, initiating automatic login...');
        await this.trendyolAdapter.performAutomaticLogin();
        await this.checkTrendyolEnabled();
        return;
      }

      // Check if token will expire in the next 30 minutes
      if (config.tokenExpiresAt) {
        const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);

        if (config.tokenExpiresAt < thirtyMinutesFromNow) {
          this.logger.log('Trendyol token expiring soon, triggering proactive login...');

          await this.trendyolAdapter.performAutomaticLogin();
          await this.checkTrendyolEnabled();

          this.logger.log('Trendyol token refresh completed');
        } else {
          const remainingMinutes = Math.round((config.tokenExpiresAt.getTime() - Date.now()) / 60000);
          this.logger.debug(`Trendyol token valid for ${remainingMinutes} more minutes`);
        }
      }
    } catch (error) {
      this.logger.error(`Token refresh check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initial login on startup if needed - runs 45 seconds after module init
   */
  @Cron('45 * * * * *', { name: 'trendyol-initial-login' }) // At second 45 of every minute
  async initialLoginCheck() {
    // Only run once at startup
    if (this.syncCount > 0) {
      return;
    }

    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.TRENDYOL },
      });

      if (!config?.accessToken || !config?.tokenExpiresAt || config.tokenExpiresAt < new Date()) {
        this.logger.log('Trendyol: Performing initial login...');
        await this.trendyolAdapter.performAutomaticLogin();
        await this.checkTrendyolEnabled();
      }
    } catch (error) {
      this.logger.error(`Initial login check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    this.logger.log('Trendyol sync force-enabled');
  }

  /**
   * Force disable sync
   */
  forceDisable(): void {
    this.isEnabled = false;
    this.logger.log('Trendyol sync force-disabled');
  }

  /**
   * Trigger manual sync
   */
  async triggerManualSync(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: 'Sync already in progress' };
    }

    this.logger.log('Triggering manual Trendyol sync...');
    await this.syncTrendyolOrders();

    return {
      success: true,
      message: `Manual sync completed. ${this.processedOrderIds.size} orders processed in this session.`,
    };
  }
}
