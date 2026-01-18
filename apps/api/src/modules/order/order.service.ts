/**
 * Order Service
 * Comprehensive order management business logic with:
 * - Order number generation (ORD-YYYYMMDD-XXXX)
 * - Transactional order creation with stock deduction
 * - Customer find-or-create logic
 * - Status transition validation
 * - Courier assignment
 * - Order cancellation with stock restoration
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { OrderGateway } from './order.gateway';
import {
  CreateOrderDto,
  CreateOrderItemDto,
} from './dto/create-order.dto';
import {
  OrderStatus,
  UpdateOrderStatusDto,
  isValidStatusTransition,
  getAllowedNextStatuses,
  CancelOrderDto,
  AssignCourierDto,
} from './dto/update-status.dto';
import {
  OrderQueryDto,
  ActiveOrdersQueryDto,
  OrderStatsQueryDto,
  OrderSortField,
  SortOrder,
} from './dto/order-query.dto';

/**
 * Platform commission rates (percentage)
 */
const PLATFORM_COMMISSION_RATES: Record<string, number> = {
  GETIR: 28,
  YEMEKSEPETI: 25,
  TRENDYOL: 20,
  DIRECT: 0,
  POS: 0,
};

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderGateway: OrderGateway,
    @InjectQueue('orders') private readonly orderQueue: Queue,
  ) {}

  /**
   * Generate unique order number in format: ORD-YYYYMMDD-XXXX
   * Uses database sequence to ensure uniqueness
   */
  async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Get count of orders for today to generate sequence
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const todayOrderCount = await this.prisma.order.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Generate 4-digit sequence number (padded with zeros)
    const sequence = String(todayOrderCount + 1).padStart(4, '0');

    return `ORD-${dateStr}-${sequence}`;
  }

  /**
   * Find or create customer based on phone number
   */
  private async findOrCreateCustomer(
    tx: Prisma.TransactionClient,
    customerData: {
      name: string;
      phone: string;
      address?: string;
      latitude?: number;
      longitude?: number;
    },
    platform: string,
  ) {
    // Try to find existing customer by phone
    let customer = await tx.customer.findUnique({
      where: { phone: customerData.phone },
    });

    if (!customer) {
      // Create new customer
      customer = await tx.customer.create({
        data: {
          phone: customerData.phone,
          name: customerData.name,
          defaultAddress: customerData.address,
          defaultLatitude: customerData.latitude
            ? new Prisma.Decimal(customerData.latitude)
            : null,
          defaultLongitude: customerData.longitude
            ? new Prisma.Decimal(customerData.longitude)
            : null,
          firstOrderPlatform: platform as any,
          isDirectCustomer: platform === 'DIRECT' || platform === 'POS',
          firstOrderAt: new Date(),
          status: 'ACTIVE',
        },
      });

      this.logger.log(`New customer created: ${customer.id} (${customer.phone})`);
    } else {
      // Update customer's last order info
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          name: customerData.name || customer.name,
          lastOrderAt: new Date(),
          totalOrders: { increment: 1 },
        },
      });
    }

    return customer;
  }

  /**
   * Deduct stock for order items based on product recipes
   */
  private async deductStockForOrder(
    tx: Prisma.TransactionClient,
    branchId: number,
    items: Array<{ productId: number; quantity: number }>,
    orderId: number,
  ) {
    for (const item of items) {
      // Get product recipe items
      const recipeItems = await tx.recipeItem.findMany({
        where: { productId: item.productId },
        include: { ingredient: true },
      });

      for (const recipeItem of recipeItems) {
        const quantityToDeduct =
          Number(recipeItem.quantity) * item.quantity;

        // Find stock item for this ingredient in the branch
        const stockItem = await tx.stockItem.findUnique({
          where: {
            ingredientId_branchId: {
              ingredientId: recipeItem.ingredientId,
              branchId: branchId,
            },
          },
        });

        if (stockItem) {
          const stockBefore = Number(stockItem.currentStock);
          const stockAfter = stockBefore - quantityToDeduct;

          // Update stock
          await tx.stockItem.update({
            where: { id: stockItem.id },
            data: {
              currentStock: new Prisma.Decimal(stockAfter),
              theoreticalStock: {
                decrement: new Prisma.Decimal(quantityToDeduct),
              },
            },
          });

          // Create stock movement record
          await tx.stockMovement.create({
            data: {
              ingredientId: recipeItem.ingredientId,
              branchId: branchId,
              type: 'SALE',
              quantity: new Prisma.Decimal(-quantityToDeduct),
              referenceType: 'order',
              referenceId: orderId,
              stockBefore: new Prisma.Decimal(stockBefore),
              stockAfter: new Prisma.Decimal(stockAfter),
              unitCost: recipeItem.ingredient.unitCost,
              totalCost: new Prisma.Decimal(
                Number(recipeItem.ingredient.unitCost) * quantityToDeduct,
              ),
              note: `Order #${orderId} - ${item.quantity}x Product #${item.productId}`,
            },
          });
        }
      }
    }
  }

  /**
   * Restore stock for cancelled order
   */
  private async restoreStockForOrder(
    tx: Prisma.TransactionClient,
    orderId: number,
  ) {
    // Get order with items
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) return;

    for (const item of order.items) {
      // Get product recipe items
      const recipeItems = await tx.recipeItem.findMany({
        where: { productId: item.productId },
        include: { ingredient: true },
      });

      for (const recipeItem of recipeItems) {
        const quantityToRestore = Number(recipeItem.quantity) * item.quantity;

        // Find stock item
        const stockItem = await tx.stockItem.findUnique({
          where: {
            ingredientId_branchId: {
              ingredientId: recipeItem.ingredientId,
              branchId: order.branchId,
            },
          },
        });

        if (stockItem) {
          const stockBefore = Number(stockItem.currentStock);
          const stockAfter = stockBefore + quantityToRestore;

          // Update stock (add back)
          await tx.stockItem.update({
            where: { id: stockItem.id },
            data: {
              currentStock: new Prisma.Decimal(stockAfter),
              theoreticalStock: {
                increment: new Prisma.Decimal(quantityToRestore),
              },
            },
          });

          // Create stock movement record
          await tx.stockMovement.create({
            data: {
              ingredientId: recipeItem.ingredientId,
              branchId: order.branchId,
              type: 'ADJUSTMENT',
              quantity: new Prisma.Decimal(quantityToRestore),
              referenceType: 'order_cancellation',
              referenceId: orderId,
              stockBefore: new Prisma.Decimal(stockBefore),
              stockAfter: new Prisma.Decimal(stockAfter),
              unitCost: recipeItem.ingredient.unitCost,
              note: `Stock restored for cancelled order #${orderId}`,
            },
          });
        }
      }
    }

    this.logger.log(`Stock restored for cancelled order: ${orderId}`);
  }

  /**
   * Calculate platform commission
   */
  private calculateCommission(platform: string, subtotal: number): number {
    const rate = PLATFORM_COMMISSION_RATES[platform] ?? 0;
    return Number(((subtotal * rate) / 100).toFixed(2));
  }

  /**
   * Create new order with transaction
   * - Generates order number
   * - Finds or creates customer
   * - Creates order and items
   * - Deducts stock based on recipes
   * - Calculates totals and commission
   */
  async create(createOrderDto: CreateOrderDto, userId: number) {
    const order = await this.prisma.executeInTransaction(async (tx) => {
      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Find or create customer
      const customer = await this.findOrCreateCustomer(
        tx,
        {
          name: createOrderDto.customer.name,
          phone: createOrderDto.customer.phone,
          address: createOrderDto.customer.address,
          latitude: createOrderDto.customer.latitude,
          longitude: createOrderDto.customer.longitude,
        },
        createOrderDto.platform,
      );

      // Fetch product details for items
      const productIds = createOrderDto.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Calculate item totals and costs
      let subtotal = 0;
      let totalCost = 0;

      const itemsData = createOrderDto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new BadRequestException(
            `Product with ID ${item.productId} not found`,
          );
        }

        const unitPrice = item.unitPrice ?? Number(product.basePrice);
        const totalPrice = unitPrice * item.quantity;
        const itemCost = Number(product.cost) * item.quantity;

        subtotal += totalPrice;
        totalCost += itemCost;

        return {
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          totalPrice: new Prisma.Decimal(totalPrice),
          cost: new Prisma.Decimal(itemCost),
          notes: item.notes,
        };
      });

      // Calculate commission and totals
      const discount = createOrderDto.discount ?? 0;
      const deliveryFee = createOrderDto.deliveryFee ?? 0;
      const platformCommission = this.calculateCommission(
        createOrderDto.platform,
        subtotal,
      );
      const totalAmount = subtotal - discount + deliveryFee;
      const netAmount = totalAmount - platformCommission;

      // Calculate estimated delivery time
      let estimatedDelivery: Date | null = null;
      if (createOrderDto.estimatedDeliveryMinutes) {
        estimatedDelivery = new Date();
        estimatedDelivery.setMinutes(
          estimatedDelivery.getMinutes() +
            createOrderDto.estimatedDeliveryMinutes,
        );
      }

      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          platform: createOrderDto.platform,
          platformOrderId: createOrderDto.platformOrderId,
          status: 'PENDING',
          customerId: customer.id,
          customerName: createOrderDto.customer.name,
          customerPhone: createOrderDto.customer.phone,
          customerAddress: createOrderDto.customer.address,
          customerNote: createOrderDto.customer.note,
          latitude: createOrderDto.customer.latitude
            ? new Prisma.Decimal(createOrderDto.customer.latitude)
            : null,
          longitude: createOrderDto.customer.longitude
            ? new Prisma.Decimal(createOrderDto.customer.longitude)
            : null,
          subtotal: new Prisma.Decimal(subtotal),
          discount: new Prisma.Decimal(discount),
          deliveryFee: new Prisma.Decimal(deliveryFee),
          platformCommission: new Prisma.Decimal(platformCommission),
          totalAmount: new Prisma.Decimal(totalAmount),
          netAmount: new Prisma.Decimal(netAmount),
          paymentMethod: createOrderDto.paymentMethod,
          paymentStatus: 'PENDING',
          branchId: createOrderDto.branchId,
          createdById: userId,
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
      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          fromStatus: null,
          toStatus: 'PENDING',
          changedById: userId,
          note: 'Order created',
        },
      });

      // Update customer totals
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalSpent: { increment: new Prisma.Decimal(totalAmount) },
          averageOrderValue: new Prisma.Decimal(
            (Number(customer.totalSpent) + totalAmount) /
              (customer.totalOrders + 1),
          ),
        },
      });

      // Deduct stock
      await this.deductStockForOrder(
        tx,
        createOrderDto.branchId,
        createOrderDto.items,
        newOrder.id,
      );

      return newOrder;
    });

    // Queue background jobs
    await this.orderQueue.add('process-new-order', {
      orderId: order.id,
      branchId: order.branchId,
    });

    // Emit real-time event - convert Decimal to number for gateway
    this.orderGateway.emitNewOrder(String(order.branchId), {
      ...order,
      totalAmount: order.totalAmount.toNumber(),
    });

    this.logger.log(
      `Order created: ${order.orderNumber} (ID: ${order.id}) - Total: ${order.totalAmount}`,
    );

    return order;
  }

  /**
   * Find all orders with filtering and pagination
   */
  async findAll(queryDto: OrderQueryDto) {
    const {
      page = 1,
      limit = 20,
      status,
      statuses,
      platform,
      platforms,
      paymentMethod,
      paymentStatus,
      branchId,
      customerId,
      courierId,
      search,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = OrderSortField.CREATED_AT,
      sortOrder = SortOrder.DESC,
    } = queryDto;

    const { skip, take } = this.prisma.paginate(page, limit);

    // Build where clause
    const where: Prisma.OrderWhereInput = {};

    // Status filters
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    } else if (status) {
      where.status = status;
    }

    // Platform filters
    if (platforms && platforms.length > 0) {
      where.platform = { in: platforms };
    } else if (platform) {
      where.platform = platform;
    }

    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (branchId) where.branchId = branchId;
    if (customerId) where.customerId = customerId;
    if (courierId) where.courierId = courierId;

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Amount range filter
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) {
        where.totalAmount.gte = new Prisma.Decimal(minAmount);
      }
      if (maxAmount !== undefined) {
        where.totalAmount.lte = new Prisma.Decimal(maxAmount);
      }
    }

    // Search filter
    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { customerName: { contains: search } },
        { customerPhone: { contains: search } },
        { platformOrderId: { contains: search } },
      ];
    }

    // Execute query
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take,
        where,
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, imageUrl: true } },
            },
          },
          customer: { select: { id: true, name: true, phone: true, status: true } },
          courier: {
            select: {
              id: true,
              user: { select: { name: true, phone: true } },
            },
          },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: orders,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Get single order by ID
   */
  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
        courier: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        branch: true,
        createdBy: { select: { id: true, name: true } },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  /**
   * Get order by order number
   */
  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: { include: { product: true } },
        customer: true,
        courier: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        branch: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    return order;
  }

  /**
   * Update order status with transition validation
   */
  async updateStatus(
    id: number,
    updateStatusDto: UpdateOrderStatusDto,
    userId: number,
  ) {
    const order = await this.findOne(id);
    const currentStatus = order.status as OrderStatus;
    const newStatus = updateStatusDto.status;

    // Validate status transition
    if (!isValidStatusTransition(currentStatus, newStatus)) {
      const allowed = getAllowedNextStatuses(currentStatus);
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}. ` +
          `Allowed transitions: ${allowed.join(', ') || 'none'}`,
      );
    }

    // Prepare update data
    const updateData: Prisma.OrderUpdateInput = {
      status: newStatus,
    };

    // Set timestamp based on status
    switch (newStatus) {
      case OrderStatus.CONFIRMED:
        updateData.confirmedAt = new Date();
        break;
      case OrderStatus.PREPARING:
        updateData.preparingAt = new Date();
        break;
      case OrderStatus.READY:
        updateData.readyAt = new Date();
        break;
      case OrderStatus.ON_DELIVERY:
        updateData.pickedUpAt = new Date();
        break;
      case OrderStatus.DELIVERED:
        updateData.deliveredAt = new Date();
        updateData.actualDelivery = new Date();
        // Calculate delivery duration
        if (order.pickedUpAt) {
          const duration = Math.round(
            (new Date().getTime() - order.pickedUpAt.getTime()) / 60000,
          );
          updateData.deliveryDuration = duration;
        }
        break;
      case OrderStatus.CANCELLED:
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = updateStatusDto.note;
        break;
    }

    // Execute update
    const updatedOrder = await this.prisma.executeInTransaction(async (tx) => {
      // Update order
      const updated = await tx.order.update({
        where: { id },
        data: updateData,
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // Create status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: currentStatus,
          toStatus: newStatus,
          changedById: userId,
          note: updateStatusDto.note,
        },
      });

      // If cancelled, restore stock
      if (newStatus === OrderStatus.CANCELLED) {
        await this.restoreStockForOrder(tx, id);
      }

      // If delivered, mark payment as paid for cash orders
      if (
        newStatus === OrderStatus.DELIVERED &&
        updated.paymentMethod === 'CASH'
      ) {
        await tx.order.update({
          where: { id },
          data: { paymentStatus: 'PAID' },
        });
      }

      return updated;
    });

    // Queue notification job
    await this.orderQueue.add('status-changed', {
      orderId: id,
      status: newStatus,
      previousStatus: currentStatus,
    });

    // Emit real-time event
    this.orderGateway.emitOrderStatusChanged(
      String(updatedOrder.branchId),
      id,
      newStatus,
      currentStatus,
    );

    this.logger.log(
      `Order ${id} status changed: ${currentStatus} -> ${newStatus}`,
    );

    return updatedOrder;
  }

  /**
   * Assign courier to order
   */
  async assignCourier(
    id: number,
    assignCourierDto: AssignCourierDto,
    userId: number,
  ) {
    const order = await this.findOne(id);

    // Validate order status (can only assign to READY orders)
    if (
      order.status !== OrderStatus.READY &&
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.PREPARING
    ) {
      throw new BadRequestException(
        `Cannot assign courier to order with status ${order.status}`,
      );
    }

    // Validate courier exists and is available
    const courier = await this.prisma.courier.findUnique({
      where: { id: assignCourierDto.courierId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!courier) {
      throw new NotFoundException(
        `Courier with ID ${assignCourierDto.courierId} not found`,
      );
    }

    // Allow assignment to any courier (multiple orders per courier is allowed)

    // Assign courier
    const updatedOrder = await this.prisma.executeInTransaction(async (tx) => {
      // Update order
      const updated = await tx.order.update({
        where: { id },
        data: {
          courierId: assignCourierDto.courierId,
        },
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
          courier: {
            include: { user: { select: { id: true, name: true, phone: true } } },
          },
          branch: { select: { id: true, name: true } },
        },
      });

      // Update courier status
      await tx.courier.update({
        where: { id: assignCourierDto.courierId },
        data: { status: 'ON_DELIVERY' },
      });

      // Create status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: order.status,
          changedById: userId,
          note: `Courier assigned: ${courier.user.name}`,
        },
      });

      return updated;
    });

    // Queue notification job
    await this.orderQueue.add('courier-assigned', {
      orderId: id,
      courierId: assignCourierDto.courierId,
    });

    // Emit real-time event
    this.orderGateway.emitOrderCourierAssigned(
      String(updatedOrder.branchId),
      id,
      {
        id: courier.id,
        name: courier.user.name,
      },
    );

    this.logger.log(
      `Courier ${courier.user.name} assigned to order ${id}`,
    );

    return updatedOrder;
  }

  /**
   * Cancel order with stock restoration
   */
  async cancel(id: number, cancelDto: CancelOrderDto, userId: number) {
    const order = await this.findOne(id);
    const currentStatus = order.status as OrderStatus;

    // Validate cancellation is allowed
    const allowedStatuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.ON_DELIVERY,
    ];

    if (!allowedStatuses.includes(currentStatus)) {
      throw new BadRequestException(
        `Cannot cancel order with status ${currentStatus}`,
      );
    }

    // Cancel order and restore stock
    const updatedOrder = await this.prisma.executeInTransaction(async (tx) => {
      // Update order
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: cancelDto.reason,
        },
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // Create status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: currentStatus,
          toStatus: 'CANCELLED',
          changedById: userId,
          note: cancelDto.reason || 'Order cancelled',
        },
      });

      // Restore stock
      await this.restoreStockForOrder(tx, id);

      // If courier was assigned, update their status
      if (order.courierId) {
        await tx.courier.update({
          where: { id: order.courierId },
          data: { status: 'AVAILABLE' },
        });
      }

      // Update customer stats
      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalOrders: { decrement: 1 },
            totalSpent: { decrement: order.totalAmount },
          },
        });
      }

      return updated;
    });

    // Queue notification job
    await this.orderQueue.add('order-cancelled', {
      orderId: id,
      reason: cancelDto.reason,
    });

    // Emit real-time event
    this.orderGateway.emitOrderStatusChanged(
      String(updatedOrder.branchId),
      id,
      'CANCELLED',
      currentStatus,
    );

    this.logger.log(`Order ${id} cancelled: ${cancelDto.reason || 'No reason'}`);

    return updatedOrder;
  }

  /**
   * Get active orders (not delivered or cancelled)
   */
  async getActiveOrders(queryDto: ActiveOrdersQueryDto) {
    const { branchId, platform, sortBy, sortOrder } = queryDto;

    const where: Prisma.OrderWhereInput = {
      status: {
        in: [
          'PENDING',
          'CONFIRMED',
          'PREPARING',
          'READY',
          'ON_DELIVERY',
        ],
      },
    };

    if (branchId) where.branchId = branchId;
    if (platform) where.platform = platform;

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true } },
        courier: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy || 'createdAt']: sortOrder || 'asc' },
    });

    // Group by status for dashboard display
    const grouped = {
      pending: orders.filter((o) => o.status === 'PENDING'),
      confirmed: orders.filter((o) => o.status === 'CONFIRMED'),
      preparing: orders.filter((o) => o.status === 'PREPARING'),
      ready: orders.filter((o) => o.status === 'READY'),
      onDelivery: orders.filter((o) => o.status === 'ON_DELIVERY'),
    };

    return {
      orders,
      grouped,
      total: orders.length,
    };
  }

  /**
   * Get order statistics
   */
  async getStats(queryDto: OrderStatsQueryDto) {
    const { branchId, startDate, endDate, platform } = queryDto;

    // Default to today if no dates provided
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate
      ? new Date(endDate)
      : new Date(new Date().setHours(23, 59, 59, 999));

    const where: Prisma.OrderWhereInput = {
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    if (branchId) where.branchId = branchId;
    if (platform) where.platform = platform;

    // Get aggregated stats
    const [
      totalOrders,
      completedOrders,
      cancelledOrders,
      pendingOrders,
      revenue,
      platformBreakdown,
      statusBreakdown,
      avgDeliveryTime,
    ] = await Promise.all([
      // Total orders
      this.prisma.order.count({ where }),

      // Completed orders
      this.prisma.order.count({
        where: { ...where, status: 'DELIVERED' },
      }),

      // Cancelled orders
      this.prisma.order.count({
        where: { ...where, status: 'CANCELLED' },
      }),

      // Pending orders (not delivered/cancelled)
      this.prisma.order.count({
        where: {
          ...where,
          status: {
            notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED'],
          },
        },
      }),

      // Revenue aggregation
      this.prisma.order.aggregate({
        where: {
          ...where,
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
        },
        _sum: {
          totalAmount: true,
          netAmount: true,
          platformCommission: true,
          discount: true,
        },
        _avg: {
          totalAmount: true,
        },
      }),

      // Platform breakdown
      this.prisma.order.groupBy({
        by: ['platform'],
        where,
        _count: true,
        _sum: { totalAmount: true },
      }),

      // Status breakdown
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),

      // Average delivery time
      this.prisma.order.aggregate({
        where: {
          ...where,
          status: 'DELIVERED',
          deliveryDuration: { not: null },
        },
        _avg: {
          deliveryDuration: true,
        },
      }),
    ]);

    return {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      orders: {
        total: totalOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
        pending: pendingOrders,
        completionRate: totalOrders > 0
          ? ((completedOrders / totalOrders) * 100).toFixed(2)
          : 0,
        cancellationRate: totalOrders > 0
          ? ((cancelledOrders / totalOrders) * 100).toFixed(2)
          : 0,
      },
      revenue: {
        gross: revenue._sum.totalAmount
          ? Number(revenue._sum.totalAmount)
          : 0,
        net: revenue._sum.netAmount ? Number(revenue._sum.netAmount) : 0,
        commission: revenue._sum.platformCommission
          ? Number(revenue._sum.platformCommission)
          : 0,
        discounts: revenue._sum.discount
          ? Number(revenue._sum.discount)
          : 0,
        averageOrderValue: revenue._avg.totalAmount
          ? Number(revenue._avg.totalAmount).toFixed(2)
          : 0,
      },
      delivery: {
        averageDeliveryTime: avgDeliveryTime._avg.deliveryDuration
          ? Math.round(avgDeliveryTime._avg.deliveryDuration)
          : null,
      },
      byPlatform: platformBreakdown.map((p) => ({
        platform: p.platform,
        count: p._count,
        revenue: p._sum.totalAmount ? Number(p._sum.totalAmount) : 0,
      })),
      byStatus: statusBreakdown.map((s) => ({
        status: s.status,
        count: s._count,
      })),
    };
  }

  /**
   * Update general order data
   */
  async update(id: number, data: Partial<Prisma.OrderUpdateInput>) {
    await this.findOne(id);

    const order = await this.prisma.order.update({
      where: { id },
      data,
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    this.logger.log(`Order updated: ${id}`);
    return order;
  }
}
