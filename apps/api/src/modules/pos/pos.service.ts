/**
 * POS Service
 * Point of Sale business logic with:
 * - Quick sale: Creates order with Platform.POS, auto-advances to DELIVERED for walk-in
 * - Table management: Open, add items, close tables
 * - Daily cash summary with payment method breakdown
 * - Session management for cashiers
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CustomerService } from '@modules/customer/customer.service';
import { Platform, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';

/**
 * Table status enum
 */
type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';

/**
 * Quick sale item structure
 */
interface QuickSaleItem {
  productId: number;
  quantity: number;
  unitPrice?: number;
  notes?: string;
}

/**
 * Quick sale request structure
 */
interface QuickSaleRequest {
  items: QuickSaleItem[];
  paymentMethod: PaymentMethod;
  customerPhone?: string;
  customerName?: string;
  notes?: string;
  discount?: number;
}

/**
 * Table structure (virtual - no DB model, managed in memory or separate table)
 */
export interface Table {
  id: number;
  name: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: number;
  openedAt?: Date;
}

/**
 * Daily summary structure
 */
export interface DailySummary {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  totalCash: number;
  totalCard: number;
  totalOnline: number;
  totalMealCard: number;
  averageOrderValue: number;
  ordersByHour: Array<{ hour: number; count: number; revenue: number }>;
  topProducts: Array<{ productId: number; name: string; quantity: number; revenue: number }>;
  paymentBreakdown: Array<{ method: PaymentMethod; count: number; amount: number }>;
}

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  /**
   * In-memory table management (in production, use a database table)
   */
  private tables: Map<number, Table> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
  ) {
    // Initialize default tables
    this.initializeTables();
  }

  /**
   * Initialize default tables
   */
  private initializeTables() {
    const defaultTables: Table[] = [
      { id: 1, name: 'Masa 1', capacity: 4, status: 'AVAILABLE' },
      { id: 2, name: 'Masa 2', capacity: 4, status: 'AVAILABLE' },
      { id: 3, name: 'Masa 3', capacity: 6, status: 'AVAILABLE' },
      { id: 4, name: 'Masa 4', capacity: 2, status: 'AVAILABLE' },
      { id: 5, name: 'Masa 5', capacity: 8, status: 'AVAILABLE' },
      { id: 6, name: 'Bar 1', capacity: 2, status: 'AVAILABLE' },
      { id: 7, name: 'Bar 2', capacity: 2, status: 'AVAILABLE' },
      { id: 8, name: 'Teras 1', capacity: 4, status: 'AVAILABLE' },
    ];

    defaultTables.forEach((table) => {
      this.tables.set(table.id, table);
    });
  }

  /**
   * Quick sale - Creates order with Platform.POS, auto-advances to DELIVERED
   */
  async quickSale(
    branchId: number,
    userId: number,
    data: QuickSaleRequest,
  ) {
    this.logger.log(`Processing quick sale at branch ${branchId}`);

    return this.prisma.executeInTransaction(async (tx) => {
      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Handle customer (optional for POS)
      let customerId: number | null = null;
      let customerName = data.customerName || 'Walk-in Customer';
      let customerPhone = data.customerPhone || '';

      if (data.customerPhone) {
        // Find or create customer
        let customer = await tx.customer.findUnique({
          where: { phone: data.customerPhone },
        });

        if (!customer) {
          customer = await tx.customer.create({
            data: {
              phone: data.customerPhone,
              name: data.customerName || 'POS Customer',
              firstOrderPlatform: Platform.POS,
              isDirectCustomer: true,
              firstOrderAt: new Date(),
              status: 'ACTIVE',
            },
          });
        }

        customerId = customer.id;
        customerName = customer.name || customerName;
        customerPhone = customer.phone;
      }

      // Fetch product details
      const productIds = data.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Calculate totals
      let subtotal = 0;
      const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const item of data.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new BadRequestException(
            `Product with ID ${item.productId} not found`,
          );
        }

        const unitPrice = item.unitPrice ?? Number(product.basePrice);
        const totalPrice = unitPrice * item.quantity;
        const cost = Number(product.cost) * item.quantity;

        subtotal += totalPrice;

        itemsData.push({
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          totalPrice: new Prisma.Decimal(totalPrice),
          cost: new Prisma.Decimal(cost),
          notes: item.notes,
        });
      }

      // Calculate final totals
      const discount = data.discount ?? 0;
      const totalAmount = subtotal - discount;
      const netAmount = totalAmount; // POS has no commission

      // Create order with DELIVERED status (immediate completion for walk-in)
      const order = await tx.order.create({
        data: {
          orderNumber,
          platform: Platform.POS,
          status: OrderStatus.DELIVERED,
          customerId,
          customerName,
          customerPhone,
          subtotal: new Prisma.Decimal(subtotal),
          discount: new Prisma.Decimal(discount),
          deliveryFee: new Prisma.Decimal(0),
          platformCommission: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(totalAmount),
          netAmount: new Prisma.Decimal(netAmount),
          paymentMethod: data.paymentMethod,
          paymentStatus: 'PAID',
          branchId,
          createdById: userId,
          confirmedAt: new Date(),
          preparingAt: new Date(),
          readyAt: new Date(),
          deliveredAt: new Date(),
          items: {
            createMany: {
              data: itemsData,
            },
          },
        },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Create status history (all at once for quick sale)
      await tx.orderStatusHistory.createMany({
        data: [
          {
            orderId: order.id,
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            changedById: userId,
            note: 'POS quick sale',
          },
          {
            orderId: order.id,
            fromStatus: OrderStatus.PENDING,
            toStatus: OrderStatus.DELIVERED,
            changedById: userId,
            note: 'Quick sale auto-completed',
          },
        ],
      });

      // Update customer stats if we have one
      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: new Prisma.Decimal(totalAmount) },
            lastOrderAt: new Date(),
          },
        });

        // Check loyalty trigger
        await this.customerService.checkLoyaltyTrigger(customerId);
      }

      // Deduct stock for items
      await this.deductStockForOrder(tx, branchId, data.items, order.id);

      this.logger.log(
        `Quick sale completed: ${order.orderNumber} - Total: ${totalAmount}`,
      );

      return order;
    });
  }

  /**
   * Get products for POS menu
   */
  async getProducts(branchId?: number) {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        isAvailable: true,
      },
      include: {
        category: true,
      },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
      ],
    });

    // Group by category
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return categories.map((category) => ({
      ...category,
      products: products.filter((p) => p.categoryId === category.id),
    }));
  }

  /**
   * Get all tables
   */
  getTables(): Table[] {
    return Array.from(this.tables.values());
  }

  /**
   * Open a table (mark as occupied and create pending order)
   */
  async openTable(
    tableId: number,
    branchId: number,
    userId: number,
    customerCount?: number,
  ) {
    const table = this.tables.get(tableId);

    if (!table) {
      throw new NotFoundException(`Table with ID ${tableId} not found`);
    }

    if (table.status !== 'AVAILABLE') {
      throw new BadRequestException(
        `Table ${table.name} is not available (status: ${table.status})`,
      );
    }

    // Create a pending order for the table
    const orderNumber = await this.generateOrderNumber();

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        platform: Platform.POS,
        status: OrderStatus.PENDING,
        customerName: `Table ${table.name}`,
        customerPhone: '',
        subtotal: new Prisma.Decimal(0),
        discount: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(0),
        platformCommission: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(0),
        paymentMethod: PaymentMethod.CASH, // Default, can be changed at close
        paymentStatus: 'PENDING',
        branchId,
        createdById: userId,
      },
    });

    // Update table status
    table.status = 'OCCUPIED';
    table.currentOrderId = order.id;
    table.openedAt = new Date();

    this.logger.log(`Table ${table.name} opened with order ${order.orderNumber}`);

    return {
      table,
      order,
      message: `Table ${table.name} opened successfully`,
    };
  }

  /**
   * Add items to a table's order
   */
  async addItemsToTable(
    tableId: number,
    branchId: number,
    userId: number,
    items: QuickSaleItem[],
  ) {
    const table = this.tables.get(tableId);

    if (!table) {
      throw new NotFoundException(`Table with ID ${tableId} not found`);
    }

    if (table.status !== 'OCCUPIED' || !table.currentOrderId) {
      throw new BadRequestException(
        `Table ${table.name} is not occupied or has no active order`,
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: table.currentOrderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found for this table');
    }

    // Fetch product details
    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Add items and calculate new totals
    let addedTotal = 0;
    const newItems: Prisma.OrderItemCreateManyInput[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Product with ID ${item.productId} not found`,
        );
      }

      const unitPrice = item.unitPrice ?? Number(product.basePrice);
      const totalPrice = unitPrice * item.quantity;
      const cost = Number(product.cost) * item.quantity;

      addedTotal += totalPrice;

      newItems.push({
        orderId: order.id,
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
        totalPrice: new Prisma.Decimal(totalPrice),
        cost: new Prisma.Decimal(cost),
        notes: item.notes,
      });
    }

    // Add items to order
    await this.prisma.orderItem.createMany({
      data: newItems,
    });

    // Update order totals
    const newSubtotal = Number(order.subtotal) + addedTotal;
    const newTotal = newSubtotal - Number(order.discount);

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        subtotal: new Prisma.Decimal(newSubtotal),
        totalAmount: new Prisma.Decimal(newTotal),
        netAmount: new Prisma.Decimal(newTotal),
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    this.logger.log(
      `Added ${items.length} items to table ${table.name}, new total: ${newTotal}`,
    );

    return {
      table,
      order: updatedOrder,
      addedItems: newItems.length,
      addedTotal,
    };
  }

  /**
   * Close a table (complete the order)
   */
  async closeTable(
    tableId: number,
    branchId: number,
    userId: number,
    data: {
      paymentMethod: PaymentMethod;
      discount?: number;
      customerPhone?: string;
      customerName?: string;
    },
  ) {
    const table = this.tables.get(tableId);

    if (!table) {
      throw new NotFoundException(`Table with ID ${tableId} not found`);
    }

    if (table.status !== 'OCCUPIED' || !table.currentOrderId) {
      throw new BadRequestException(
        `Table ${table.name} is not occupied or has no active order`,
      );
    }

    return this.prisma.executeInTransaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: table.currentOrderId! },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundException('Order not found for this table');
      }

      if (order.items.length === 0) {
        throw new BadRequestException('Cannot close table with no items');
      }

      // Handle customer
      let customerId: number | null = null;
      if (data.customerPhone) {
        let customer = await tx.customer.findUnique({
          where: { phone: data.customerPhone },
        });

        if (!customer) {
          customer = await tx.customer.create({
            data: {
              phone: data.customerPhone,
              name: data.customerName || 'POS Customer',
              firstOrderPlatform: Platform.POS,
              isDirectCustomer: true,
              firstOrderAt: new Date(),
              status: 'ACTIVE',
            },
          });
        }

        customerId = customer.id;
      }

      // Calculate final totals
      const discount = data.discount ?? Number(order.discount);
      const totalAmount = Number(order.subtotal) - discount;

      // Update order to completed
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.DELIVERED,
          customerId,
          customerName: data.customerName || order.customerName,
          customerPhone: data.customerPhone || order.customerPhone,
          discount: new Prisma.Decimal(discount),
          totalAmount: new Prisma.Decimal(totalAmount),
          netAmount: new Prisma.Decimal(totalAmount),
          paymentMethod: data.paymentMethod,
          paymentStatus: 'PAID',
          confirmedAt: table.openedAt,
          preparingAt: table.openedAt,
          readyAt: new Date(),
          deliveredAt: new Date(),
        },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Create status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.DELIVERED,
          changedById: userId,
          note: `Table ${table.name} closed`,
        },
      });

      // Update customer stats if we have one
      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: new Prisma.Decimal(totalAmount) },
            lastOrderAt: new Date(),
          },
        });

        // Check loyalty trigger
        await this.customerService.checkLoyaltyTrigger(customerId);
      }

      // Deduct stock for all items
      await this.deductStockForOrder(
        tx,
        branchId,
        order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        order.id,
      );

      // Reset table status
      table.status = 'AVAILABLE';
      table.currentOrderId = undefined;
      table.openedAt = undefined;

      this.logger.log(
        `Table ${table.name} closed, order ${order.orderNumber} completed - Total: ${totalAmount}`,
      );

      return {
        table,
        order: updatedOrder,
        message: `Table ${table.name} closed successfully`,
      };
    });
  }

  /**
   * Get daily summary with payment method breakdown
   */
  async getDailySummary(branchId: number, date?: string): Promise<DailySummary> {
    // Default to today
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const where: Prisma.OrderWhereInput = {
      branchId,
      platform: Platform.POS,
      status: OrderStatus.DELIVERED,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    // Parallel queries
    const [
      orderCount,
      revenueStats,
      paymentBreakdown,
      topProducts,
      hourlyBreakdown,
    ] = await Promise.all([
      // Total orders
      this.prisma.order.count({ where }),

      // Revenue stats
      this.prisma.order.aggregate({
        where,
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
      }),

      // Payment method breakdown
      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where,
        _count: true,
        _sum: { totalAmount: true },
      }),

      // Top products
      this.prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          order: where,
        },
        _sum: {
          quantity: true,
          totalPrice: true,
        },
        orderBy: {
          _sum: {
            totalPrice: 'desc',
          },
        },
        take: 10,
      }),

      // Orders by hour
      this.prisma.$queryRaw<Array<{ hour: number; count: bigint; revenue: number }>>`
        SELECT
          HOUR(createdAt) as hour,
          COUNT(*) as count,
          SUM(totalAmount) as revenue
        FROM orders
        WHERE branchId = ${branchId}
          AND platform = 'POS'
          AND status = 'DELIVERED'
          AND createdAt >= ${startOfDay}
          AND createdAt <= ${endOfDay}
        GROUP BY HOUR(createdAt)
        ORDER BY hour
      `,
    ]);

    // Process payment breakdown
    const paymentMap: Record<string, { count: number; amount: number }> = {
      CASH: { count: 0, amount: 0 },
      CREDIT_CARD: { count: 0, amount: 0 },
      ONLINE: { count: 0, amount: 0 },
      MEAL_CARD: { count: 0, amount: 0 },
    };

    paymentBreakdown.forEach((p) => {
      paymentMap[p.paymentMethod] = {
        count: p._count,
        amount: Number(p._sum.totalAmount) || 0,
      };
    });

    return {
      date: targetDate.toISOString().split('T')[0],
      totalOrders: orderCount,
      totalRevenue: Number(revenueStats._sum.totalAmount) || 0,
      totalCash: paymentMap.CASH.amount,
      totalCard: paymentMap.CREDIT_CARD.amount,
      totalOnline: paymentMap.ONLINE.amount,
      totalMealCard: paymentMap.MEAL_CARD.amount,
      averageOrderValue: Number(revenueStats._avg.totalAmount) || 0,
      ordersByHour: hourlyBreakdown.map((h) => ({
        hour: h.hour,
        count: Number(h.count),
        revenue: Number(h.revenue) || 0,
      })),
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productName,
        quantity: Number(p._sum.quantity) || 0,
        revenue: Number(p._sum.totalPrice) || 0,
      })),
      paymentBreakdown: Object.entries(paymentMap).map(([method, data]) => ({
        method: method as PaymentMethod,
        count: data.count,
        amount: data.amount,
      })),
    };
  }

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

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

    const sequence = String(todayOrderCount + 1).padStart(4, '0');
    return `POS-${dateStr}-${sequence}`;
  }

  /**
   * Deduct stock for order items
   */
  private async deductStockForOrder(
    tx: Prisma.TransactionClient,
    branchId: number,
    items: Array<{ productId: number; quantity: number }>,
    orderId: number,
  ) {
    for (const item of items) {
      const recipeItems = await tx.recipeItem.findMany({
        where: { productId: item.productId },
        include: { ingredient: true },
      });

      for (const recipeItem of recipeItems) {
        const quantityToDeduct = Number(recipeItem.quantity) * item.quantity;

        const stockItem = await tx.stockItem.findUnique({
          where: {
            ingredientId_branchId: {
              ingredientId: recipeItem.ingredientId,
              branchId,
            },
          },
        });

        if (stockItem) {
          const stockBefore = Number(stockItem.currentStock);
          const stockAfter = stockBefore - quantityToDeduct;

          await tx.stockItem.update({
            where: { id: stockItem.id },
            data: {
              currentStock: new Prisma.Decimal(stockAfter),
              theoreticalStock: {
                decrement: new Prisma.Decimal(quantityToDeduct),
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              ingredientId: recipeItem.ingredientId,
              branchId,
              type: 'SALE',
              quantity: new Prisma.Decimal(-quantityToDeduct),
              referenceType: 'pos_order',
              referenceId: orderId,
              stockBefore: new Prisma.Decimal(stockBefore),
              stockAfter: new Prisma.Decimal(stockAfter),
              unitCost: recipeItem.ingredient.unitCost,
              totalCost: new Prisma.Decimal(
                Number(recipeItem.ingredient.unitCost) * quantityToDeduct,
              ),
              note: `POS Order #${orderId}`,
            },
          });
        }
      }
    }
  }

  // Session management methods - stubbed until PosSession model is added to schema
  // TODO: Add PosSession model to prisma/schema.prisma to enable session management
  async getSessions(_branchId?: number, _date?: string) {
    this.logger.warn('POS session management not available: PosSession model not in schema');
    return [];
  }

  async getCurrentSession(_branchId?: number, _userId?: number) {
    this.logger.warn('POS session management not available: PosSession model not in schema');
    return null;
  }

  async openSession(_branchId: number, _userId: number, _initialCash: number) {
    throw new BadRequestException('POS session management not available: PosSession model not in schema');
  }

  async closeSession(
    _id: number,
    _userId: number,
    _data: { finalCash: number; notes?: string },
  ) {
    throw new NotFoundException('POS session management not available: PosSession model not in schema');
  }
}
