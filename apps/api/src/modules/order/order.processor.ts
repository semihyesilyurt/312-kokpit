/**
 * Order Processor
 * BullMQ background job processor for order-related tasks
 *
 * Job types:
 * - process-new-order: Handle new order creation tasks
 * - status-changed: Handle status change notifications and side effects
 * - courier-assigned: Handle courier assignment notifications
 * - order-cancelled: Handle cancellation notifications
 * - send-notification: Send customer/staff notifications
 * - check-late-orders: Periodic check for delayed orders
 * - auto-confirm: Auto-confirm orders from certain platforms
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { OrderGateway } from './order.gateway';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Job data interfaces
 */
interface ProcessNewOrderJob {
  orderId: number;
  branchId: number;
}

interface StatusChangedJob {
  orderId: number;
  status: string;
  previousStatus: string;
}

interface CourierAssignedJob {
  orderId: number;
  courierId: number;
}

interface OrderCancelledJob {
  orderId: number;
  reason?: string;
}

interface SendNotificationJob {
  orderId: number;
  type: 'customer' | 'staff' | 'courier';
  channel: 'sms' | 'push' | 'email' | 'whatsapp';
  template: string;
  data?: Record<string, unknown>;
}

interface CheckLateOrdersJob {
  branchId?: number;
  thresholdMinutes: number;
}

interface AutoConfirmJob {
  orderId: number;
  platform: string;
}

type OrderJobData =
  | ProcessNewOrderJob
  | StatusChangedJob
  | CourierAssignedJob
  | OrderCancelledJob
  | SendNotificationJob
  | CheckLateOrdersJob
  | AutoConfirmJob;

/**
 * Status labels for notifications
 */
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Beklemede',
  CONFIRMED: 'Onaylandi',
  PREPARING: 'Hazirlaniyor',
  READY: 'Hazir',
  ON_DELIVERY: 'Yolda',
  DELIVERED: 'Teslim Edildi',
  CANCELLED: 'Iptal Edildi',
  REFUNDED: 'Iade Edildi',
};

@Processor('orders')
@Injectable()
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderGateway: OrderGateway,
  ) {
    super();
  }

  /**
   * Main job processor
   */
  async process(job: Job<OrderJobData>): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} (ID: ${job.id})`);

    try {
      switch (job.name) {
        case 'process-new-order':
          return await this.processNewOrder(job.data as ProcessNewOrderJob);

        case 'status-changed':
          return await this.handleStatusChanged(job.data as StatusChangedJob);

        case 'courier-assigned':
          return await this.handleCourierAssigned(job.data as CourierAssignedJob);

        case 'order-cancelled':
          return await this.handleOrderCancelled(job.data as OrderCancelledJob);

        case 'send-notification':
          return await this.sendNotification(job.data as SendNotificationJob);

        case 'check-late-orders':
          return await this.checkLateOrders(job.data as CheckLateOrdersJob);

        case 'auto-confirm':
          return await this.autoConfirmOrder(job.data as AutoConfirmJob);

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.name}:`, error);
      throw error;
    }
  }

  /**
   * Process new order
   * - Emits real-time events
   * - Triggers notifications
   * - Handles auto-confirmation for certain platforms
   */
  private async processNewOrder(data: ProcessNewOrderJob) {
    const { orderId, branchId } = data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    // Emit real-time new order event
    this.orderGateway.emitNewOrder(String(branchId), {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      platform: order.platform,
      customerName: order.customerName,
      totalAmount: order.totalAmount.toNumber(),
      branchId: order.branchId,
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
      })),
    });

    // Create notification for branch staff
    await this.createNotification({
      type: 'NEW_ORDER',
      channel: 'IN_APP',
      title: 'Yeni Siparis',
      body: `${order.orderNumber} - ${order.customerName} - ${order.totalAmount} TL`,
      data: { orderId: order.id, branchId: order.branchId },
    });

    // Check if platform supports auto-confirmation
    const autoConfirmPlatforms = ['GETIR', 'YEMEKSEPETI', 'TRENDYOL'];
    if (autoConfirmPlatforms.includes(order.platform)) {
      // Check platform config for auto-accept setting
      const platformConfig = await this.prisma.platformConfig.findUnique({
        where: { platform: order.platform },
      });

      if (platformConfig?.autoAccept) {
        // Schedule auto-confirmation (after 30 seconds delay)
        // This would be added to the queue with delay
        this.logger.log(
          `Auto-confirm scheduled for order ${orderId} from ${order.platform}`,
        );
      }
    }

    this.logger.log(`New order processed: ${order.orderNumber}`);
    return { success: true, orderId, orderNumber: order.orderNumber };
  }

  /**
   * Handle status change
   * - Emits real-time events
   * - Sends customer notifications
   * - Updates related records
   */
  private async handleStatusChanged(data: StatusChangedJob) {
    const { orderId, status, previousStatus } = data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        courier: {
          include: { user: { select: { name: true, phone: true } } },
        },
        branch: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    // Emit real-time status change
    this.orderGateway.emitOrderStatusChanged(
      String(order.branchId),
      orderId,
      status,
      previousStatus,
    );

    // Create notification based on status
    const statusLabel = STATUS_LABELS[status] || status;
    await this.createNotification({
      type: 'ORDER_UPDATE',
      channel: 'IN_APP',
      recipientPhone: order.customerPhone,
      title: 'Siparis Durumu Guncellendi',
      body: `${order.orderNumber} siparisinin durumu: ${statusLabel}`,
      data: { orderId, status, previousStatus },
    });

    // Handle specific status transitions
    switch (status) {
      case 'PREPARING':
        // Notify kitchen staff
        this.logger.log(`Order ${orderId} moved to kitchen queue`);
        break;

      case 'READY':
        // Notify couriers if delivery order
        if (order.customerAddress) {
          await this.createNotification({
            type: 'NEW_ORDER',
            channel: 'PUSH',
            title: 'Siparis Hazir',
            body: `${order.orderNumber} siparisi teslimata hazir`,
            data: { orderId, branchId: order.branchId },
          });
        }
        break;

      case 'ON_DELIVERY':
        // Send SMS to customer with courier info
        if (order.courier) {
          this.logger.log(
            `Customer notification: Courier ${order.courier.user.name} is on the way`,
          );
        }
        break;

      case 'DELIVERED':
        // Update courier stats
        if (order.courierId) {
          await this.prisma.courier.update({
            where: { id: order.courierId },
            data: {
              totalDeliveries: { increment: 1 },
              status: 'AVAILABLE',
            },
          });

          // Update average delivery time if available
          if (order.deliveryDuration) {
            const courier = await this.prisma.courier.findUnique({
              where: { id: order.courierId },
            });

            if (courier) {
              const newAverage =
                courier.averageDeliveryTime && courier.totalDeliveries > 0
                  ? Math.round(
                      (courier.averageDeliveryTime * (courier.totalDeliveries - 1) +
                        order.deliveryDuration) /
                        courier.totalDeliveries,
                    )
                  : order.deliveryDuration;

              await this.prisma.courier.update({
                where: { id: order.courierId },
                data: { averageDeliveryTime: newAverage },
              });
            }
          }
        }
        break;
    }

    this.logger.log(
      `Order ${orderId} status change processed: ${previousStatus} -> ${status}`,
    );
    return { success: true, orderId, status, previousStatus };
  }

  /**
   * Handle courier assignment
   */
  private async handleCourierAssigned(data: CourierAssignedJob) {
    const { orderId, courierId } = data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        courier: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
        branch: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    // Emit courier assigned event
    if (order.courier) {
      this.orderGateway.emitOrderCourierAssigned(
        String(order.branchId),
        orderId,
        {
          id: order.courier.id,
          name: order.courier.user.name,
        },
      );

      // Notify courier
      await this.createNotification({
        type: 'COURIER_ASSIGNED',
        channel: 'PUSH',
        recipientId: order.courier.userId,
        title: 'Yeni Teslimat',
        body: `${order.orderNumber} siparisi size atandi`,
        data: {
          orderId,
          customerName: order.customerName,
          customerAddress: order.customerAddress,
          customerPhone: order.customerPhone,
        },
      });
    }

    this.logger.log(`Courier assignment processed: Order ${orderId} -> Courier ${courierId}`);
    return { success: true, orderId, courierId };
  }

  /**
   * Handle order cancellation
   */
  private async handleOrderCancelled(data: OrderCancelledJob) {
    const { orderId, reason } = data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        courier: {
          include: { user: { select: { name: true, phone: true } } },
        },
        branch: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    // Emit cancellation event
    this.orderGateway.emitOrderCancelled(String(order.branchId), orderId, reason);

    // Notify customer
    await this.createNotification({
      type: 'ORDER_UPDATE',
      channel: 'IN_APP',
      recipientPhone: order.customerPhone,
      title: 'Siparis Iptal Edildi',
      body: `${order.orderNumber} siparisinin iptali: ${reason || 'Sebep belirtilmedi'}`,
      data: { orderId, reason },
    });

    // If courier was assigned, notify them too
    if (order.courier) {
      await this.createNotification({
        type: 'ORDER_UPDATE',
        channel: 'PUSH',
        recipientId: order.courier.userId,
        title: 'Siparis Iptal Edildi',
        body: `${order.orderNumber} siparisi iptal edildi`,
        data: { orderId },
      });
    }

    this.logger.log(`Order cancellation processed: ${orderId}`);
    return { success: true, orderId, reason };
  }

  /**
   * Send notification (SMS, push, email, WhatsApp)
   */
  private async sendNotification(data: SendNotificationJob) {
    const { orderId, type, channel, template, data: templateData } = data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { phone: true } },
        courier: { include: { user: true } },
      },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    // Determine recipient based on type
    let recipientPhone: string | undefined;
    let recipientId: number | undefined;

    switch (type) {
      case 'customer':
        recipientPhone = order.customerPhone;
        break;
      case 'courier':
        recipientPhone = order.courier?.user?.phone || undefined;
        recipientId = order.courier?.userId;
        break;
    }

    // Create notification record
    await this.createNotification({
      type: 'ORDER_UPDATE',
      channel: channel.toUpperCase() as any,
      recipientId,
      recipientPhone,
      title: template,
      body: JSON.stringify(templateData || {}),
      data: { orderId, ...templateData },
    });

    this.logger.log(`Notification sent: ${channel} to ${type} for order ${orderId}`);
    return { success: true, orderId, type, channel };
  }

  /**
   * Check for late orders
   */
  private async checkLateOrders(data: CheckLateOrdersJob) {
    const { branchId, thresholdMinutes } = data;

    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - thresholdMinutes);

    const where: Record<string, unknown> = {
      status: { in: ['PENDING', 'CONFIRMED', 'PREPARING'] },
      createdAt: { lt: thresholdTime },
    };

    if (branchId) {
      where.branchId = branchId;
    }

    const lateOrders = await this.prisma.order.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    if (lateOrders.length > 0) {
      // Create alert notification
      await this.createNotification({
        type: 'SYSTEM_ALERT',
        channel: 'IN_APP',
        title: 'Geciken Siparisler',
        body: `${lateOrders.length} siparis ${thresholdMinutes} dakikayi gecti`,
        data: {
          count: lateOrders.length,
          orderIds: lateOrders.map((o) => o.id),
        },
        priority: 1,
      });

      this.logger.warn(
        `Found ${lateOrders.length} late orders (>${thresholdMinutes} min)`,
      );
    }

    return { success: true, lateOrderCount: lateOrders.length };
  }

  /**
   * Auto-confirm order from platform
   */
  private async autoConfirmOrder(data: AutoConfirmJob) {
    const { orderId, platform } = data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    // Only auto-confirm if still pending
    if (order.status !== 'PENDING') {
      this.logger.log(
        `Order ${orderId} already ${order.status}, skipping auto-confirm`,
      );
      return { success: false, reason: 'Order not pending' };
    }

    // Update order status
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });

    // Create status history
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: 'PENDING',
        toStatus: 'CONFIRMED',
        note: `Auto-confirmed from ${platform}`,
      },
    });

    this.logger.log(`Order ${orderId} auto-confirmed from ${platform}`);
    return { success: true, orderId };
  }

  /**
   * Helper: Create notification record
   */
  private async createNotification(data: {
    type: string;
    channel: string;
    recipientId?: number;
    recipientPhone?: string;
    recipientEmail?: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    priority?: number;
  }) {
    try {
      await this.prisma.notification.create({
        data: {
          type: data.type as any,
          channel: data.channel as any,
          recipientId: data.recipientId,
          recipientPhone: data.recipientPhone,
          recipientEmail: data.recipientEmail,
          title: data.title,
          body: data.body,
          data: data.data as Prisma.InputJsonValue,
          priority: data.priority || 0,
          status: 'pending',
        },
      });
    } catch (error) {
      this.logger.error('Failed to create notification:', error);
    }
  }

  /**
   * Worker event handlers
   */
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

  @OnWorkerEvent('progress')
  onProgress(job: Job, progress: number | object) {
    this.logger.debug(`Job ${job.name} (${job.id}) progress: ${JSON.stringify(progress)}`);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Job ${jobId} stalled`);
  }
}
