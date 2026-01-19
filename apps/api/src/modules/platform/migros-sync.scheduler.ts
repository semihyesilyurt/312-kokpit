/**
 * Migros Sync Scheduler
 * High-frequency order polling (every 20 seconds) specifically for Migros platform
 * Handles JWT token refresh and real-time order synchronization
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { Platform, Prisma } from '@prisma/client';
import { MigrosAdapter } from './adapters/migros.adapter';
import { OrderService } from '@modules/order/order.service';
import { OrderGateway } from '@modules/order/order.gateway';
import { PlatformOrder } from './adapters/platform-adapter.interface';

/**
 * Migros commission rate (13%)
 */
const MIGROS_COMMISSION_RATE = 13;

@Injectable()
export class MigrosSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(MigrosSyncScheduler.name);
  private isSyncing = false;
  private isEnabled = false;
  private syncCount = 0;
  private lastSyncTime: Date | null = null;
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly migrosAdapter: MigrosAdapter,
    private readonly orderService: OrderService,
    private readonly orderGateway: OrderGateway,
    @InjectQueue('platform-sync') private readonly syncQueue: Queue,
  ) {}

  /**
   * Initialize scheduler on module start
   */
  async onModuleInit() {
    await this.checkMigrosEnabled();
    this.logger.log(`Migros sync scheduler initialized. Enabled: ${this.isEnabled}`);
  }

  /**
   * Check if Migros platform is enabled and has valid credentials
   */
  private async checkMigrosEnabled(): Promise<boolean> {
    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.MIGROS },
      });

      this.isEnabled = !!(config?.isActive && config?.accessToken);

      if (!this.isEnabled) {
        this.logger.debug('Migros platform is not active or missing credentials');
      }

      return this.isEnabled;
    } catch (error) {
      this.logger.error(`Error checking Migros status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * High-frequency Migros order sync - every 20 seconds
   * This ensures near real-time order visibility
   */
  @Cron('*/20 * * * * *') // Every 20 seconds
  async syncMigrosOrders() {
    // Skip if already syncing or disabled
    if (this.isSyncing) {
      this.logger.debug('Migros sync already in progress, skipping...');
      return;
    }

    // Re-check if Migros is enabled periodically
    if (this.syncCount % 30 === 0) { // Every 10 minutes (30 * 20 seconds)
      await this.checkMigrosEnabled();
    }

    if (!this.isEnabled) {
      return;
    }

    // Circuit breaker: Stop syncing after too many consecutive errors
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      this.logger.warn(`Migros sync paused due to ${this.consecutiveErrors} consecutive errors. Will retry in 5 minutes.`);

      // Reset after 5 minutes (15 cycles)
      if (this.syncCount % 15 === 0) {
        this.consecutiveErrors = 0;
        this.logger.log('Migros sync circuit breaker reset');
      }
      return;
    }

    this.isSyncing = true;
    this.syncCount++;
    const startTime = Date.now();

    try {
      this.logger.debug(`Starting Migros order sync #${this.syncCount}`);

      // Fetch orders from Migros
      const platformOrders = await this.migrosAdapter.fetchOrders();

      if (platformOrders.length === 0) {
        this.logger.debug('No active orders from Migros');
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
            `Error processing Migros order ${platformOrder.platformOrderId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      // Check for delivered orders (orders that disappeared from Migros active list)
      const deliveredCount = await this.checkDeliveredOrders(platformOrders);

      // Log sync result
      const duration = Date.now() - startTime;
      this.consecutiveErrors = 0; // Reset on success
      this.lastSyncTime = new Date();

      if (ordersCreated > 0 || ordersUpdated > 0 || deliveredCount > 0) {
        this.logger.log(
          `Migros sync #${this.syncCount} completed in ${duration}ms: ${ordersCreated} created, ${ordersUpdated} updated, ${deliveredCount} delivered`,
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
    } catch (error) {
      this.consecutiveErrors++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Migros sync #${this.syncCount} failed: ${errorMsg}`);

      // Log failure to database
      await this.logSyncAction(false, {
        errorMessage: errorMsg,
        duration: Date.now() - startTime,
      });

      // If authentication error, disable until re-authenticated
      if (errorMsg.includes('Authentication failed') || errorMsg.includes('Manual login required')) {
        this.isEnabled = false;
        this.logger.warn('Migros sync disabled due to authentication failure. Manual login required.');

        await this.prisma.platformConfig.update({
          where: { platform: Platform.MIGROS },
          data: {
            syncStatus: 'auth_failed',
            syncError: 'JWT token expired. Manual login required via Turnstile CAPTCHA.',
          },
        });
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process a single order from Migros
   * Returns 'created', 'updated', or 'skipped'
   * - New orders: Create in DB + auto-accept on Migros
   * - Existing orders: Sync status from platform to DB (except DELIVERED/CANCELLED)
   */
  private async processOrder(platformOrder: PlatformOrder): Promise<'created' | 'updated' | 'skipped'> {
    // Check if order already exists
    const existingOrder = await this.prisma.order.findFirst({
      where: {
        platformOrderId: platformOrder.platformOrderId,
        platform: Platform.MIGROS,
      },
    });

    if (existingOrder) {
      // Order exists - sync status from platform if not in final state
      const finalStatuses = ['DELIVERED', 'CANCELLED'];

      if (finalStatuses.includes(existingOrder.status)) {
        return 'skipped';
      }

      // Check if platform status is different from DB status
      const platformStatus = platformOrder.platformStatus;
      this.logger.debug(
        `Migros order ${existingOrder.orderNumber}: DB=${existingOrder.status}, Platform=${platformStatus}`,
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
            note: `Status synced from Migros platform`,
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
          `Migros order ${existingOrder.orderNumber} status updated: ${existingOrder.status} → ${platformStatus}`,
        );

        return 'updated';
      }

      return 'skipped';
    }

    // Create new order
    const order = await this.createOrder(platformOrder);

    // Auto-accept order on Migros platform (25 min preparation time)
    try {
      const accepted = await this.migrosAdapter.acceptOrder(
        platformOrder.platformOrderId,
        25, // Default 25 minutes preparation time
      );

      if (accepted) {
        this.logger.log(`Migros order ${order.orderNumber} auto-accepted on platform`);

        // Update order status to CONFIRMED after acceptance
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: 'CONFIRMED' },
        });

        // Create status history for acceptance
        await this.prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: 'PENDING',
            toStatus: 'CONFIRMED',
            note: 'Order auto-accepted on Migros platform',
          },
        });

        // Update order object for WebSocket emission
        order.status = 'CONFIRMED';
      } else {
        this.logger.warn(`Failed to auto-accept Migros order ${order.orderNumber} on platform`);
      }
    } catch (error) {
      this.logger.error(
        `Error auto-accepting Migros order ${order.orderNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Emit real-time notification
    this.orderGateway.emitNewOrder(String(order.branchId), {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      platform: order.platform,
      customerName: order.customerName,
      totalAmount: Number(order.totalAmount),
      branchId: order.branchId,
      items: order.items.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
      })),
    });

    this.logger.log(`New Migros order created: ${order.orderNumber} (Platform ID: ${platformOrder.platformOrderId})`);

    return 'created';
  }

  /**
   * Check for delivered orders
   * Orders that are in active states in DB but no longer in Migros active list are considered delivered
   */
  private async checkDeliveredOrders(platformOrders: PlatformOrder[]): Promise<number> {
    // Get all active platform order IDs from current sync
    const activePlatformOrderIds = new Set(platformOrders.map(o => o.platformOrderId));

    // Find DB orders that are in active states but not in Migros active list
    const potentiallyDelivered = await this.prisma.order.findMany({
      where: {
        platform: Platform.MIGROS,
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
            note: 'Order delivered (no longer in Migros active list)',
          },
        });

        // Emit WebSocket update
        this.orderGateway.emitOrderStatusChanged(
          String(order.branchId),
          order.id,
          'DELIVERED',
          order.status,
        );

        this.logger.log(`Migros order ${order.orderNumber} marked as DELIVERED (disappeared from active list)`);
        deliveredCount++;
      }
    }

    return deliveredCount;
  }

  /**
   * Create order from Migros platform order
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
          firstOrderPlatform: Platform.MIGROS,
          isDirectCustomer: false,
          firstOrderAt: new Date(),
          status: 'ACTIVE',
        },
      });
    }

    // Map products to order items
    const itemsData = [];
    for (const item of platformOrder.items) {
      // Try to find product by name
      const product = await this.prisma.product.findFirst({
        where: {
          OR: [
            { name: { contains: item.name.split(' ').slice(0, 2).join(' ') } },
            { name: item.name },
          ],
        },
      });

      const totalPrice = item.unitPrice * item.quantity;

      if (product) {
        const cost = Number(product.cost) * item.quantity;
        itemsData.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          totalPrice: new Prisma.Decimal(totalPrice),
          cost: new Prisma.Decimal(cost),
          notes: item.notes,
        });
      } else {
        // Create with default product ID 1 if no match found
        itemsData.push({
          productId: 1,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          totalPrice: new Prisma.Decimal(totalPrice),
          cost: new Prisma.Decimal(0),
          notes: item.notes,
        });
      }
    }

    // Calculate commission (Migros ~13%)
    const platformCommission = Number(
      ((platformOrder.subtotal * MIGROS_COMMISSION_RATE) / 100).toFixed(2),
    );
    const netAmount = platformOrder.totalAmount - platformCommission;

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
        platform: Platform.MIGROS,
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
        subtotal: new Prisma.Decimal(platformOrder.subtotal),
        discount: new Prisma.Decimal(platformOrder.discount),
        deliveryFee: new Prisma.Decimal(platformOrder.deliveryFee),
        platformCommission: new Prisma.Decimal(platformCommission),
        totalAmount: new Prisma.Decimal(platformOrder.totalAmount),
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
        note: 'Order imported from Migros',
      },
    });

    // Update customer totals
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: { increment: 1 },
        totalSpent: { increment: new Prisma.Decimal(platformOrder.totalAmount) },
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
          platform: Platform.MIGROS,
          action: 'sync_orders_20s',
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
          where: { platform: Platform.MIGROS },
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
   * Token refresh check - runs every 33 minutes (JWT expires in 36 min)
   * Proactively refreshes token before expiration via automatic login
   */
  @Cron('0 */33 * * * *') // Every 33 minutes
  async checkTokenRefresh() {
    try {
      this.logger.debug('Checking Migros token status...');

      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.MIGROS },
      });

      // If no token or config, attempt login
      if (!config?.accessToken) {
        this.logger.log('No Migros token found, initiating automatic login...');
        await this.migrosAdapter.performAutomaticLogin();
        await this.checkMigrosEnabled();
        return;
      }

      // Check if token will expire in the next 10 minutes
      if (config.tokenExpiresAt) {
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);

        if (config.tokenExpiresAt < tenMinutesFromNow) {
          this.logger.log('Migros token expiring soon, triggering proactive login...');

          // Use adapter's checkAndRefreshLogin which handles both refresh and full login
          await this.migrosAdapter.checkAndRefreshLogin();
          await this.checkMigrosEnabled();

          this.logger.log('Migros token refresh completed');
        } else {
          const remainingMinutes = Math.round((config.tokenExpiresAt.getTime() - Date.now()) / 60000);
          this.logger.debug(`Migros token valid for ${remainingMinutes} more minutes`);
        }
      }
    } catch (error) {
      this.logger.error(`Token refresh check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initial login on startup if needed - runs 30 seconds after module init
   * This gives time for Turnstile solver to start
   */
  @Cron('30 * * * * *', { name: 'migros-initial-login' }) // At second 30 of every minute
  async initialLoginCheck() {
    // Only run once at startup
    if (this.syncCount > 0) {
      return;
    }

    try {
      const config = await this.prisma.platformConfig.findUnique({
        where: { platform: Platform.MIGROS },
      });

      if (!config?.accessToken || !config?.tokenExpiresAt || config.tokenExpiresAt < new Date()) {
        this.logger.log('Migros: Performing initial login...');
        await this.migrosAdapter.performAutomaticLogin();
        await this.checkMigrosEnabled();
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
    };
  }
}
