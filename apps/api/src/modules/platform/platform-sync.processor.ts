/**
 * Platform Sync Processor
 * BullMQ processor for handling platform synchronization jobs
 * Processes: sync-orders, sync-menu
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PlatformService } from './platform.service';
import { OrderService } from '@modules/order/order.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Platform, Prisma } from '@prisma/client';
import { PlatformOrder } from './adapters/platform-adapter.interface';

/**
 * Commission rates by platform
 */
const PLATFORM_COMMISSION_RATES: Record<string, number> = {
  GETIR: 28,
  YEMEKSEPETI: 25,
  TRENDYOL: 20,
  MIGROS: 13,
  DIRECT: 0,
  POS: 0,
};

@Processor('platform-sync')
export class PlatformSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(PlatformSyncProcessor.name);

  constructor(
    private readonly platformService: PlatformService,
    private readonly orderService: OrderService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  /**
   * Process platform sync jobs
   */
  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(
      `Processing job ${job.name} (${job.id}) for platform: ${job.data.platform}`,
    );

    switch (job.name) {
      case 'sync-orders':
        return this.processSyncOrders(job);
      case 'sync-menu':
        return this.processSyncMenu(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }

  /**
   * Sync orders from platform
   */
  private async processSyncOrders(
    job: Job<{ platform: Platform; triggeredManually?: boolean }>,
  ) {
    const { platform, triggeredManually } = job.data;
    const startTime = Date.now();

    this.logger.log(
      `Starting order sync for ${platform}${triggeredManually ? ' (manual)' : ' (scheduled)'}`,
    );

    try {
      // Fetch orders from platform
      const platformOrders = await this.platformService.fetchOrders(platform);

      if (platformOrders.length === 0) {
        this.logger.debug(`No new orders from ${platform}`);
        await this.platformService.logSyncAction(platform, 'sync_orders', true, {
          recordsCount: 0,
          duration: Date.now() - startTime,
        });
        return { ordersCreated: 0 };
      }

      // Get platform config for auto-accept setting
      const config = await this.platformService.findByPlatform(platform);

      // Process each order
      let ordersCreated = 0;
      const errors: string[] = [];

      for (const platformOrder of platformOrders) {
        try {
          // Check if order already exists
          const existingOrder = await this.prisma.order.findFirst({
            where: {
              platformOrderId: platformOrder.platformOrderId,
              platform,
            },
          });

          if (existingOrder) {
            this.logger.debug(
              `Order ${platformOrder.platformOrderId} already exists, skipping`,
            );
            continue;
          }

          // Create order in our system
          const order = await this.createOrderFromPlatform(platformOrder);
          ordersCreated++;

          // Auto-accept if configured
          if (config.autoAccept) {
            await this.platformService.acceptOrder(
              platform,
              platformOrder.platformOrderId,
              25, // Default 25 minutes
            );

            // Update order status to CONFIRMED
            await this.orderService.updateStatus(
              order.id,
              { status: 'CONFIRMED' as any },
              0, // System user
            );
          }

          this.logger.log(
            `Order created from ${platform}: ${order.orderNumber} (Platform ID: ${platformOrder.platformOrderId})`,
          );
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          errors.push(
            `Order ${platformOrder.platformOrderId}: ${errorMsg}`,
          );
          this.logger.error(
            `Failed to create order ${platformOrder.platformOrderId}: ${errorMsg}`,
          );
        }
      }

      // Log the sync action
      const success = errors.length === 0;
      await this.platformService.logSyncAction(
        platform,
        'sync_orders',
        success,
        {
          recordsCount: ordersCreated,
          duration: Date.now() - startTime,
          errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
          responseData: { ordersCreated, totalFetched: platformOrders.length },
        },
      );

      // Update platform last sync timestamp
      await this.prisma.platformConfig.update({
        where: { platform },
        data: {
          lastSyncAt: new Date(),
          syncStatus: success ? 'success' : 'partial',
          syncError: success ? null : errors.join('; '),
        },
      });

      this.logger.log(
        `Order sync completed for ${platform}: ${ordersCreated} orders created`,
      );

      return { ordersCreated, errors };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error';

      await this.platformService.logSyncAction(platform, 'sync_orders', false, {
        duration: Date.now() - startTime,
        errorMessage: errorMsg,
      });

      this.logger.error(`Order sync failed for ${platform}: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Sync menu to platform
   */
  private async processSyncMenu(
    job: Job<{ platform: Platform; triggeredManually?: boolean }>,
  ) {
    const { platform, triggeredManually } = job.data;

    this.logger.log(
      `Starting menu sync for ${platform}${triggeredManually ? ' (manual)' : ' (scheduled)'}`,
    );

    try {
      const result = await this.platformService.syncMenu(platform);

      this.logger.log(
        `Menu sync completed for ${platform}: ${result.recordsCount} products synced`,
      );

      return result;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Menu sync failed for ${platform}: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Create order from platform order data
   */
  private async createOrderFromPlatform(platformOrder: PlatformOrder) {
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
          firstOrderPlatform: platformOrder.platform,
          isDirectCustomer: false,
          firstOrderAt: new Date(),
          status: 'ACTIVE',
        },
      });
    }

    // Map platform products to our products (best effort matching by name)
    const itemsData = [];
    for (const item of platformOrder.items) {
      // Try to find product by name (simplified - in production would use platformProductId mapping)
      const product = await this.prisma.product.findFirst({
        where: {
          OR: [
            { name: { contains: item.name } },
            { name: item.name },
          ],
        },
      });

      if (product) {
        const totalPrice = item.unitPrice * item.quantity;
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
        // Create order item without product link
        itemsData.push({
          productId: 1, // Default product ID - should be handled better in production
          productName: item.name,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          totalPrice: new Prisma.Decimal(item.unitPrice * item.quantity),
          cost: new Prisma.Decimal(0),
          notes: item.notes,
        });
      }
    }

    // Calculate commission
    const commissionRate = PLATFORM_COMMISSION_RATES[platformOrder.platform] ?? 0;
    const platformCommission = Number(
      ((platformOrder.subtotal * commissionRate) / 100).toFixed(2),
    );
    const netAmount = platformOrder.totalAmount - platformCommission;

    // Calculate estimated delivery
    let estimatedDelivery: Date | null = null;
    if (platformOrder.estimatedDeliveryMinutes) {
      estimatedDelivery = new Date();
      estimatedDelivery.setMinutes(
        estimatedDelivery.getMinutes() + platformOrder.estimatedDeliveryMinutes,
      );
    }

    // Get default branch (first active branch)
    const branch = await this.prisma.branch.findFirst({
      where: { isActive: true },
    });

    if (!branch) {
      throw new Error('No active branch found');
    }

    // Create order
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        platform: platformOrder.platform,
        platformOrderId: platformOrder.platformOrderId,
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
        note: `Order imported from ${platformOrder.platform}`,
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

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.name} (${job.id}) completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.name} (${job.id}) failed: ${error.message}`,
      error.stack,
    );
  }
}
