/**
 * Customer Service
 * Customer management business logic with:
 * - Sleeping customer detection (30+ days without order)
 * - Loyalty program: 3rd order triggers "312DIREKT" code for 20% discount
 * - Win-back campaigns via SMS/WhatsApp
 * - Customer statistics and analytics
 * - Direct customer conversion tracking
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma, CustomerStatus, Platform, NotificationChannel } from '@prisma/client';

/**
 * Loyalty discount code for 3rd order
 */
const LOYALTY_CODE = '312DIREKT';
const LOYALTY_DISCOUNT_PERCENT = 20;
const SLEEPING_THRESHOLD_DAYS = 30;

/**
 * Event payload for loyalty trigger
 */
export interface LoyaltyTriggeredEvent {
  customerId: number;
  phone: string;
  name: string;
  orderCount: number;
  code: string;
  discountPercent: number;
}

/**
 * Win-back campaign channels
 */
export type WinbackChannel = 'SMS' | 'WHATSAPP';

interface FindAllOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerStatus;
  isDirectCustomer?: boolean;
  minOrders?: number;
  maxOrders?: number;
  sortBy?: 'createdAt' | 'lastOrderAt' | 'totalOrders' | 'totalSpent';
  sortOrder?: 'asc' | 'desc';
}

interface WinbackOptions {
  channel: WinbackChannel;
  message?: string;
  templateId?: string;
}

export interface CustomerStatsResult {
  total: number;
  active: number;
  sleeping: number;
  lost: number;
  vip: number;
  directCustomers: number;
  platformCustomers: number;
  averageOrderValue: number;
  totalRevenue: number;
  conversionRate: number;
  topCustomers: Array<{
    id: number;
    name: string;
    phone: string;
    totalOrders: number;
    totalSpent: number;
  }>;
}

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('customer-winback') private readonly winbackQueue: Queue,
  ) {}

  /**
   * Find all customers with filtering and pagination
   */
  async findAll(options: FindAllOptions = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      isDirectCustomer,
      minOrders,
      maxOrders,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Prisma.CustomerWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (isDirectCustomer !== undefined) {
      where.isDirectCustomer = isDirectCustomer;
    }

    if (minOrders !== undefined || maxOrders !== undefined) {
      where.totalOrders = {};
      if (minOrders !== undefined) {
        where.totalOrders.gte = minOrders;
      }
      if (maxOrders !== undefined) {
        where.totalOrders.lte = maxOrders;
      }
    }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        skip,
        take,
        where,
        include: {
          _count: { select: { orders: true } },
        },
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: customers,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Get customer by ID with full details
   */
  async findOne(id: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true } },
        orders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
              },
            },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    // Calculate days since last order
    const daysSinceLastOrder = customer.lastOrderAt
      ? Math.floor(
          (Date.now() - customer.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      ...customer,
      daysSinceLastOrder,
    };
  }

  /**
   * Get customer's order history with pagination
   */
  async getOrderHistory(
    id: number,
    options: { page?: number; limit?: number } = {},
  ) {
    await this.findOne(id);

    const { page = 1, limit = 20 } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take,
        where: { customerId: id },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, imageUrl: true } },
            },
          },
          branch: { select: { id: true, name: true } },
          courier: {
            include: {
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where: { customerId: id } }),
    ]);

    return {
      items: orders,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Get sleeping customers (30+ days without order)
   */
  async getSleepingCustomers(options: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 20 } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - SLEEPING_THRESHOLD_DAYS);

    const where: Prisma.CustomerWhereInput = {
      OR: [
        {
          lastOrderAt: { lt: thresholdDate },
          totalOrders: { gt: 0 },
        },
        {
          status: CustomerStatus.SLEEPING,
        },
      ],
    };

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        skip,
        take,
        where,
        include: {
          _count: { select: { orders: true } },
        },
        orderBy: { lastOrderAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    // Calculate days since last order for each customer
    const customersWithDays = customers.map((customer) => ({
      ...customer,
      daysSinceLastOrder: customer.lastOrderAt
        ? Math.floor(
            (Date.now() - customer.lastOrderAt.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null,
    }));

    return {
      items: customersWithDays,
      meta: this.prisma.buildPaginationMeta(total, page, take),
      threshold: SLEEPING_THRESHOLD_DAYS,
    };
  }

  /**
   * Send win-back campaign to a sleeping customer
   */
  async sendWinback(id: number, options: WinbackOptions) {
    const customer = await this.findOne(id);

    // Validate customer is actually sleeping
    if (
      customer.status !== CustomerStatus.SLEEPING &&
      (customer.daysSinceLastOrder === null ||
        customer.daysSinceLastOrder < SLEEPING_THRESHOLD_DAYS)
    ) {
      throw new BadRequestException(
        `Customer is not sleeping. Last order was ${customer.daysSinceLastOrder ?? 'never'} days ago`,
      );
    }

    // Validate phone number exists
    if (!customer.phone) {
      throw new BadRequestException('Customer has no phone number');
    }

    // Default message template
    const defaultMessage = `Merhaba ${customer.name || 'Degerli Musterimiz'}! Sizi ozledik. 312 Lahmacun'da yeni lezzetlerimizi kesfetmeye davet ediyoruz. Ozel indirimlerimiz icin siparis verin!`;

    // Queue the win-back notification
    const job = await this.winbackQueue.add('send-winback', {
      customerId: customer.id,
      phone: customer.phone,
      name: customer.name,
      channel: options.channel,
      message: options.message || defaultMessage,
      templateId: options.templateId,
    });

    // Update customer status to show win-back was attempted
    await this.prisma.customer.update({
      where: { id },
      data: {
        notes: customer.notes
          ? `${customer.notes}\nWin-back sent: ${new Date().toISOString()} via ${options.channel}`
          : `Win-back sent: ${new Date().toISOString()} via ${options.channel}`,
      },
    });

    this.logger.log(
      `Win-back campaign sent to customer ${id} via ${options.channel}`,
    );

    return {
      success: true,
      customerId: id,
      channel: options.channel,
      jobId: job.id,
      message: 'Win-back campaign queued successfully',
    };
  }

  /**
   * Get customer statistics
   */
  async getStats(): Promise<CustomerStatsResult> {
    const [
      statusCounts,
      directCount,
      platformCount,
      revenueStats,
      topCustomers,
    ] = await Promise.all([
      // Count by status
      this.prisma.customer.groupBy({
        by: ['status'],
        _count: true,
      }),

      // Direct customers count
      this.prisma.customer.count({
        where: { isDirectCustomer: true },
      }),

      // Platform customers count
      this.prisma.customer.count({
        where: { isDirectCustomer: false },
      }),

      // Revenue statistics
      this.prisma.customer.aggregate({
        _sum: { totalSpent: true },
        _avg: { averageOrderValue: true },
        _count: true,
      }),

      // Top customers by spend
      this.prisma.customer.findMany({
        take: 10,
        orderBy: { totalSpent: 'desc' },
        where: { totalOrders: { gt: 0 } },
        select: {
          id: true,
          name: true,
          phone: true,
          totalOrders: true,
          totalSpent: true,
        },
      }),
    ]);

    // Process status counts
    const statusMap: Record<string, number> = {};
    statusCounts.forEach((s) => {
      statusMap[s.status] = s._count;
    });

    const total = revenueStats._count || 0;
    const active = statusMap[CustomerStatus.ACTIVE] || 0;
    const sleeping = statusMap[CustomerStatus.SLEEPING] || 0;
    const lost = statusMap[CustomerStatus.LOST] || 0;
    const vip = statusMap[CustomerStatus.VIP] || 0;

    // Calculate conversion rate (direct customers / total * 100)
    const conversionRate =
      total > 0 ? Number(((directCount / total) * 100).toFixed(2)) : 0;

    return {
      total,
      active,
      sleeping,
      lost,
      vip,
      directCustomers: directCount,
      platformCustomers: platformCount,
      averageOrderValue: revenueStats._avg.averageOrderValue
        ? Number(revenueStats._avg.averageOrderValue)
        : 0,
      totalRevenue: revenueStats._sum.totalSpent
        ? Number(revenueStats._sum.totalSpent)
        : 0,
      conversionRate,
      topCustomers: topCustomers.map((c) => ({
        id: c.id,
        name: c.name || 'Unknown',
        phone: c.phone,
        totalOrders: c.totalOrders,
        totalSpent: Number(c.totalSpent),
      })),
    };
  }

  /**
   * Convert a platform customer to direct customer
   * This marks them as direct and updates their status
   */
  async convertToDirectCustomer(id: number) {
    const customer = await this.findOne(id);

    if (customer.isDirectCustomer) {
      throw new BadRequestException('Customer is already a direct customer');
    }

    const updatedCustomer = await this.prisma.customer.update({
      where: { id },
      data: {
        isDirectCustomer: true,
        notes: customer.notes
          ? `${customer.notes}\nConverted to direct: ${new Date().toISOString()}`
          : `Converted to direct: ${new Date().toISOString()}`,
      },
    });

    this.logger.log(`Customer ${id} converted to direct customer`);

    // Emit event for potential follow-up actions
    this.eventEmitter.emit('customer.converted', {
      customerId: id,
      phone: customer.phone,
      name: customer.name,
      previousPlatform: customer.firstOrderPlatform,
    });

    return updatedCustomer;
  }

  /**
   * Check and trigger loyalty program
   * Called when an order is placed - triggers on 3rd order
   */
  async checkLoyaltyTrigger(customerId: number): Promise<LoyaltyTriggeredEvent | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return null;
    }

    // Check if this is the 3rd order
    if (customer.totalOrders === 3) {
      const loyaltyEvent: LoyaltyTriggeredEvent = {
        customerId: customer.id,
        phone: customer.phone,
        name: customer.name || 'Degerli Musterimiz',
        orderCount: customer.totalOrders,
        code: LOYALTY_CODE,
        discountPercent: LOYALTY_DISCOUNT_PERCENT,
      };

      // Emit loyalty triggered event
      this.eventEmitter.emit('customer.loyalty.triggered', loyaltyEvent);

      this.logger.log(
        `Loyalty triggered for customer ${customerId} - 3rd order. Code: ${LOYALTY_CODE}`,
      );

      return loyaltyEvent;
    }

    return null;
  }

  /**
   * Update customer status based on order activity
   * Called periodically by a cron job
   */
  async updateCustomerStatuses(): Promise<{ updated: number }> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - SLEEPING_THRESHOLD_DAYS);

    // Update customers to SLEEPING if no order in 30+ days
    const result = await this.prisma.customer.updateMany({
      where: {
        status: CustomerStatus.ACTIVE,
        lastOrderAt: { lt: thresholdDate },
        totalOrders: { gt: 0 },
      },
      data: {
        status: CustomerStatus.SLEEPING,
      },
    });

    this.logger.log(`Updated ${result.count} customers to SLEEPING status`);

    return { updated: result.count };
  }

  /**
   * Create a new customer
   */
  async create(data: {
    name: string;
    phone: string;
    email?: string;
    defaultAddress?: string;
    defaultLatitude?: number;
    defaultLongitude?: number;
    firstOrderPlatform?: Platform;
  }) {
    // Check for existing customer with same phone
    const existing = await this.prisma.customer.findUnique({
      where: { phone: data.phone },
    });

    if (existing) {
      throw new BadRequestException(
        `Customer with phone ${data.phone} already exists`,
      );
    }

    const customer = await this.prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        defaultAddress: data.defaultAddress,
        defaultLatitude: data.defaultLatitude
          ? new Prisma.Decimal(data.defaultLatitude)
          : null,
        defaultLongitude: data.defaultLongitude
          ? new Prisma.Decimal(data.defaultLongitude)
          : null,
        firstOrderPlatform: data.firstOrderPlatform,
        isDirectCustomer:
          data.firstOrderPlatform === Platform.DIRECT ||
          data.firstOrderPlatform === Platform.POS,
        status: CustomerStatus.ACTIVE,
      },
    });

    this.logger.log(`Customer created: ${customer.name} (${customer.phone})`);
    return customer;
  }

  /**
   * Update customer
   */
  async update(
    id: number,
    data: Partial<{
      name: string;
      email: string;
      defaultAddress: string;
      defaultLatitude: number;
      defaultLongitude: number;
      status: CustomerStatus;
      notes: string;
    }>,
  ) {
    await this.findOne(id);

    const updateData: Prisma.CustomerUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.defaultAddress !== undefined)
      updateData.defaultAddress = data.defaultAddress;
    if (data.defaultLatitude !== undefined)
      updateData.defaultLatitude = new Prisma.Decimal(data.defaultLatitude);
    if (data.defaultLongitude !== undefined)
      updateData.defaultLongitude = new Prisma.Decimal(data.defaultLongitude);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const customer = await this.prisma.customer.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Customer updated: ${id}`);
    return customer;
  }

  /**
   * Delete customer (soft delete by setting status to LOST)
   */
  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.customer.update({
      where: { id },
      data: {
        status: CustomerStatus.LOST,
        notes: `Marked as lost: ${new Date().toISOString()}`,
      },
    });

    this.logger.log(`Customer marked as lost: ${id}`);
    return { message: 'Customer marked as lost' };
  }
}
