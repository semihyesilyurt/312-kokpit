/**
 * Delivery Service
 * Comprehensive delivery and courier management business logic
 * Includes auto-assignment scoring algorithm and cash balance management
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DeliveryGateway } from './delivery.gateway';
import { Prisma, CourierStatus, PaymentMethod, OrderStatus, UserRole, UserStatus } from '@prisma/client';
import {
  UpdateCourierStatusDto,
  CourierStatusEnum,
  UpdateLocationDto,
  CashTransactionDto,
  CashTransactionType,
  CreateCourierDto,
  UpdateCourierDto,
} from './dto';
import * as bcrypt from 'bcrypt';

// Scoring weights for auto-assignment algorithm
const SCORING_WEIGHTS = {
  distance: 0.35,
  load: 0.25,
  performance: 0.20,
  returning: 0.20,
};

const MINIMUM_ASSIGNMENT_SCORE = 30;

interface FindAllOptions {
  page?: number;
  limit?: number;
  status?: string;
  branchId?: string;
}

interface CourierWithDetails {
  id: number;
  userId: number;
  branchId: number;
  status: CourierStatus;
  currentLatitude: Prisma.Decimal | null;
  currentLongitude: Prisma.Decimal | null;
  lastLocationAt: Date | null;
  totalDeliveries: number;
  averageDeliveryTime: number | null;
  performanceScore: number;
  cashBalance: Prisma.Decimal;
  isOnShift: boolean;
  user: {
    id: number;
    name: string;
    phone: string | null;
  };
  _count?: {
    orders: number;
  };
}

interface OrderWithDetails {
  id: number;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  branchId: number;
  branch: {
    latitude: Prisma.Decimal;
    longitude: Prisma.Decimal;
  };
}

interface CourierScore {
  courier: CourierWithDetails;
  totalScore: number;
  scores: {
    distance: number;
    load: number;
    performance: number;
    returning: number;
  };
}

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryGateway: DeliveryGateway,
  ) {}

  // ============================================================================
  // COURIER MANAGEMENT
  // ============================================================================

  /**
   * Get all couriers with pagination and filtering
   */
  async getCouriers(options: FindAllOptions = {}) {
    const { page = 1, limit = 20, status, branchId } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Prisma.CourierWhereInput = {
      // Only show couriers with active users (soft delete filter)
      user: { status: UserStatus.ACTIVE },
    };
    if (status) where.status = status as CourierStatus;
    if (branchId) where.branchId = parseInt(branchId, 10);

    const [couriers, total] = await Promise.all([
      this.prisma.courier.findMany({
        skip,
        take,
        where,
        include: {
          user: { select: { id: true, name: true, phone: true, email: true, status: true } },
          branch: { select: { id: true, name: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { performanceScore: 'desc' },
      }),
      this.prisma.courier.count({ where }),
    ]);

    return {
      items: couriers,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Get courier by ID with full details
   */
  async getCourierById(courierId: number) {
    const courier = await this.prisma.courier.findUnique({
      where: { id: courierId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, address: true } },
        _count: {
          select: {
            orders: true,
            cashTransactions: true,
          },
        },
      },
    });

    if (!courier) {
      throw new NotFoundException(`Courier with ID ${courierId} not found`);
    }

    return courier;
  }

  /**
   * Create a new courier (User + Courier profile)
   */
  async createCourier(dto: CreateCourierDto) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException(`Bu e-posta adresi zaten kullaniliyor: ${dto.email}`);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create user and courier profile in a transaction
    const result = await this.prisma.executeInTransaction(async (tx) => {
      // Create user with COURIER role
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          phone: dto.phone,
          role: UserRole.COURIER,
          status: UserStatus.ACTIVE,
          branchId: dto.branchId,
        },
      });

      // Create courier profile
      const courier = await tx.courier.create({
        data: {
          userId: user.id,
          branchId: dto.branchId,
          vehicleType: dto.vehicleType,
          vehiclePlate: dto.vehiclePlate,
          status: CourierStatus.OFFLINE,
        },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      return courier;
    });

    this.logger.log(`Courier created: ${dto.email} (ID: ${result.id})`);

    return result;
  }

  /**
   * Update courier information
   */
  async updateCourier(courierId: number, dto: UpdateCourierDto) {
    const courier = await this.getCourierById(courierId);

    const result = await this.prisma.executeInTransaction(async (tx) => {
      // Update user info if provided
      const userUpdateData: Record<string, unknown> = {};
      if (dto.name !== undefined) userUpdateData.name = dto.name;
      if (dto.phone !== undefined) userUpdateData.phone = dto.phone;
      if (dto.branchId !== undefined) userUpdateData.branchId = dto.branchId;
      if (dto.isActive !== undefined) {
        userUpdateData.status = dto.isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE;
      }
      if (dto.password) {
        userUpdateData.password = await bcrypt.hash(dto.password, 10);
      }

      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: courier.userId },
          data: userUpdateData,
        });
      }

      // Update courier profile
      const courierUpdateData: Prisma.CourierUpdateInput = {};
      if (dto.branchId !== undefined) {
        courierUpdateData.branch = { connect: { id: dto.branchId } };
      }
      if (dto.vehicleType !== undefined) courierUpdateData.vehicleType = dto.vehicleType;
      if (dto.vehiclePlate !== undefined) courierUpdateData.vehiclePlate = dto.vehiclePlate;

      const updatedCourier = await tx.courier.update({
        where: { id: courierId },
        data: courierUpdateData,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, status: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      return updatedCourier;
    });

    this.logger.log(`Courier updated: ID ${courierId}`);

    return result;
  }

  /**
   * Delete (deactivate) a courier
   */
  async deleteCourier(courierId: number) {
    const courier = await this.getCourierById(courierId);

    // Check if courier has active orders
    const activeOrders = await this.prisma.order.count({
      where: {
        courierId,
        status: { in: [OrderStatus.ON_DELIVERY, OrderStatus.READY] },
      },
    });

    if (activeOrders > 0) {
      throw new BadRequestException(
        `Kurye silinemez: ${activeOrders} aktif siparisi var`,
      );
    }

    // Soft delete: set user status to INACTIVE and courier to OFFLINE
    await this.prisma.executeInTransaction(async (tx) => {
      await tx.user.update({
        where: { id: courier.userId },
        data: { status: UserStatus.INACTIVE },
      });

      await tx.courier.update({
        where: { id: courierId },
        data: { status: CourierStatus.OFFLINE, isOnShift: false },
      });
    });

    this.logger.log(`Courier deactivated: ID ${courierId}`);

    return { message: 'Kurye basariyla silindi', courierId };
  }

  /**
   * Update courier status
   */
  async updateCourierStatus(
    courierId: number,
    dto: UpdateCourierStatusDto,
    userId?: string,
  ) {
    const courier = await this.getCourierById(courierId);
    const previousStatus = courier.status;

    const updateData: Prisma.CourierUpdateInput = {
      status: dto.status as CourierStatus,
    };

    // Handle shift tracking
    if (dto.status === CourierStatusEnum.AVAILABLE && !courier.isOnShift) {
      updateData.isOnShift = true;
      updateData.shiftStartedAt = new Date();
    } else if (dto.status === CourierStatusEnum.OFFLINE) {
      updateData.isOnShift = false;
    }

    const updated = await this.prisma.courier.update({
      where: { id: courierId },
      data: updateData,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Emit WebSocket event
    this.deliveryGateway.emitCourierStatusChanged(
      courier.branchId.toString(),
      courierId,
      dto.status,
      previousStatus,
    );

    this.logger.log(
      `Courier ${courierId} status changed: ${previousStatus} -> ${dto.status}`,
    );

    return updated;
  }

  /**
   * Update courier location
   */
  async updateCourierLocation(courierId: number, dto: UpdateLocationDto) {
    const courier = await this.getCourierById(courierId);

    const updated = await this.prisma.courier.update({
      where: { id: courierId },
      data: {
        currentLatitude: dto.latitude,
        currentLongitude: dto.longitude,
        lastLocationAt: new Date(),
      },
    });

    // Emit WebSocket event for real-time tracking
    this.deliveryGateway.emitCourierLocation(
      courier.branchId.toString(),
      courierId,
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        speed: dto.speed,
        heading: dto.heading,
        orderId: dto.orderId,
      },
    );

    return { message: 'Location updated', timestamp: new Date().toISOString() };
  }

  /**
   * Get orders assigned to a courier
   */
  async getCourierOrders(
    courierId: number,
    options: { status?: string; page?: number; limit?: number } = {},
  ) {
    await this.getCourierById(courierId);

    const { page = 1, limit = 20, status } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Prisma.OrderWhereInput = { courierId };
    if (status) where.status = status as OrderStatus;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take,
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: { select: { productName: true, quantity: true, totalPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: orders,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Get courier performance metrics
   */
  async getCourierPerformance(courierId: number, period: string = '30d') {
    const courier = await this.getCourierById(courierId);

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get delivery statistics for the period
    const deliveries = await this.prisma.order.findMany({
      where: {
        courierId,
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate },
      },
      select: {
        id: true,
        deliveryDuration: true,
        totalAmount: true,
        deliveredAt: true,
        createdAt: true,
      },
    });

    const totalDeliveries = deliveries.length;
    const totalRevenue = deliveries.reduce(
      (sum, d) => sum + Number(d.totalAmount),
      0,
    );

    const deliveryTimes = deliveries
      .filter((d) => d.deliveryDuration !== null)
      .map((d) => d.deliveryDuration as number);

    const avgDeliveryTime =
      deliveryTimes.length > 0
        ? Math.round(
            deliveryTimes.reduce((sum, t) => sum + t, 0) / deliveryTimes.length,
          )
        : null;

    // Calculate on-time delivery rate (assuming 45 min is on-time)
    const onTimeThreshold = 45;
    const onTimeDeliveries = deliveryTimes.filter((t) => t <= onTimeThreshold).length;
    const onTimeRate =
      deliveryTimes.length > 0
        ? Math.round((onTimeDeliveries / deliveryTimes.length) * 100)
        : null;

    // Get daily breakdown
    const dailyStats = await this.prisma.order.groupBy({
      by: ['deliveredAt'],
      where: {
        courierId,
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: startDate },
      },
      _count: true,
      _sum: { totalAmount: true },
    });

    return {
      courier: {
        id: courier.id,
        name: courier.user.name,
        performanceScore: courier.performanceScore,
        rating: courier.rating,
        totalDeliveries: courier.totalDeliveries,
        averageDeliveryTime: courier.averageDeliveryTime,
      },
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        label: period,
      },
      metrics: {
        deliveriesCompleted: totalDeliveries,
        totalRevenue,
        averageDeliveryTime: avgDeliveryTime,
        onTimeDeliveryRate: onTimeRate,
        dailyAverage:
          totalDeliveries > 0
            ? Math.round(
                totalDeliveries /
                  Math.ceil(
                    (now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
                  ),
              )
            : 0,
      },
      dailyBreakdown: dailyStats,
    };
  }

  // ============================================================================
  // CASH BALANCE MANAGEMENT
  // ============================================================================

  /**
   * Record a cash transaction for courier
   */
  async recordCashTransaction(
    courierId: number,
    dto: CashTransactionDto,
    userId?: string,
  ) {
    const courier = await this.getCourierById(courierId);
    const currentBalance = Number(courier.cashBalance);

    let newBalance: number;
    switch (dto.type) {
      case CashTransactionType.COLLECTION:
        // Cash collected from customer increases balance
        newBalance = currentBalance + dto.amount;
        break;
      case CashTransactionType.HANDOVER:
        // Cash handed over to branch decreases balance
        if (currentBalance < dto.amount) {
          throw new BadRequestException(
            `Insufficient balance. Current: ${currentBalance}, Requested: ${dto.amount}`,
          );
        }
        newBalance = currentBalance - dto.amount;
        break;
      case CashTransactionType.ADVANCE:
        // Advance given to courier increases balance (to be collected)
        newBalance = currentBalance + dto.amount;
        break;
      case CashTransactionType.ADJUSTMENT:
        // Adjustment can go either way, handled by sign in amount
        newBalance = currentBalance + dto.amount;
        break;
      default:
        throw new BadRequestException(`Invalid transaction type: ${dto.type}`);
    }

    const transaction = await this.prisma.executeInTransaction(async (tx) => {
      // Create transaction record
      const cashTransaction = await tx.courierCashTransaction.create({
        data: {
          courierId,
          type: dto.type,
          amount: dto.amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          orderId: dto.orderId,
          note: dto.note,
          createdById: userId ? parseInt(userId, 10) : undefined,
        },
      });

      // Update courier balance
      await tx.courier.update({
        where: { id: courierId },
        data: { cashBalance: newBalance },
      });

      return cashTransaction;
    });

    this.logger.log(
      `Cash transaction for courier ${courierId}: ${dto.type} ${dto.amount}, new balance: ${newBalance}`,
    );

    return {
      transaction,
      newBalance,
    };
  }

  /**
   * Get courier cash balance and recent transactions
   */
  async getCourierBalance(courierId: number, limit: number = 10) {
    const courier = await this.getCourierById(courierId);

    const transactions = await this.prisma.courierCashTransaction.findMany({
      where: { courierId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Calculate summary
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTransactions = await this.prisma.courierCashTransaction.findMany({
      where: {
        courierId,
        createdAt: { gte: todayStart },
      },
    });

    const todayCollected = todayTransactions
      .filter((t) => t.type === 'collection')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const todayHandedOver = todayTransactions
      .filter((t) => t.type === 'handover')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      currentBalance: Number(courier.cashBalance),
      today: {
        collected: todayCollected,
        handedOver: todayHandedOver,
        net: todayCollected - todayHandedOver,
      },
      recentTransactions: transactions,
    };
  }

  // ============================================================================
  // AUTO-ASSIGNMENT ALGORITHM
  // ============================================================================

  /**
   * Auto-assign a courier to an order using scoring algorithm
   * Weights: distance 0.35, load 0.25, performance 0.20, returning 0.20
   * Minimum score: 30
   */
  async autoAssignCourier(
    orderId: number,
    branchId?: number,
    minScore: number = MINIMUM_ASSIGNMENT_SCORE,
  ) {
    // Get order details
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        branch: { select: { latitude: true, longitude: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.courierId) {
      throw new BadRequestException(`Order ${orderId} already has a courier assigned`);
    }

    const targetBranchId = branchId || order.branchId;

    // Get available couriers in the branch
    const availableCouriers = await this.prisma.courier.findMany({
      where: {
        branchId: targetBranchId,
        status: { in: [CourierStatus.AVAILABLE, CourierStatus.RETURNING] },
        isOnShift: true,
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        _count: {
          select: {
            orders: {
              where: {
                status: { in: [OrderStatus.ON_DELIVERY, OrderStatus.READY] },
              },
            },
          },
        },
      },
    });

    if (availableCouriers.length === 0) {
      return {
        success: false,
        message: 'No available couriers in the branch',
        order,
        availableCouriers: 0,
      };
    }

    // Calculate scores for each courier
    const scoredCouriers: CourierScore[] = availableCouriers.map((courier) => {
      const scores = this.calculateCourierScore(
        courier as unknown as CourierWithDetails,
        order as unknown as OrderWithDetails,
      );
      return {
        courier: courier as unknown as CourierWithDetails,
        scores,
        totalScore:
          scores.distance * SCORING_WEIGHTS.distance +
          scores.load * SCORING_WEIGHTS.load +
          scores.performance * SCORING_WEIGHTS.performance +
          scores.returning * SCORING_WEIGHTS.returning,
      };
    });

    // Sort by total score descending
    scoredCouriers.sort((a, b) => b.totalScore - a.totalScore);

    // Get the best courier if score meets minimum threshold
    const bestCourier = scoredCouriers[0];

    if (bestCourier.totalScore < minScore) {
      return {
        success: false,
        message: `Best courier score (${bestCourier.totalScore.toFixed(2)}) below minimum threshold (${minScore})`,
        order,
        candidates: scoredCouriers.slice(0, 5).map((sc) => ({
          courierId: sc.courier.id,
          name: sc.courier.user.name,
          totalScore: sc.totalScore.toFixed(2),
          scores: sc.scores,
        })),
      };
    }

    // Assign the courier
    const updatedOrder = await this.prisma.executeInTransaction(async (tx) => {
      // Update order with courier assignment
      const assigned = await tx.order.update({
        where: { id: orderId },
        data: {
          courierId: bestCourier.courier.id,
          status: OrderStatus.ON_DELIVERY,
        },
        include: {
          courier: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
          customer: { select: { name: true, phone: true } },
        },
      });

      // Update courier status to ON_DELIVERY
      await tx.courier.update({
        where: { id: bestCourier.courier.id },
        data: { status: CourierStatus.ON_DELIVERY },
      });

      // Create status history entry
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.ON_DELIVERY,
          note: `Auto-assigned to courier ${bestCourier.courier.user.name} (score: ${bestCourier.totalScore.toFixed(2)})`,
        },
      });

      return assigned;
    });

    // Emit WebSocket events
    this.deliveryGateway.emitCourierStatusChanged(
      targetBranchId.toString(),
      bestCourier.courier.id,
      CourierStatus.ON_DELIVERY,
      bestCourier.courier.status,
    );

    this.logger.log(
      `Order ${orderId} auto-assigned to courier ${bestCourier.courier.id} with score ${bestCourier.totalScore.toFixed(2)}`,
    );

    return {
      success: true,
      message: 'Courier assigned successfully',
      order: updatedOrder,
      assignment: {
        courierId: bestCourier.courier.id,
        courierName: bestCourier.courier.user.name,
        totalScore: bestCourier.totalScore.toFixed(2),
        scores: bestCourier.scores,
        weights: SCORING_WEIGHTS,
      },
      candidates: scoredCouriers.slice(0, 5).map((sc) => ({
        courierId: sc.courier.id,
        name: sc.courier.user.name,
        totalScore: sc.totalScore.toFixed(2),
        scores: sc.scores,
      })),
    };
  }

  /**
   * Calculate individual scores for courier assignment
   * Returns scores 0-100 for each factor
   */
  calculateCourierScore(
    courier: CourierWithDetails,
    order: OrderWithDetails,
  ): {
    distance: number;
    load: number;
    performance: number;
    returning: number;
  } {
    // Distance Score (0-100): closer is better
    let distanceScore = 50; // default if no location data
    if (
      courier.currentLatitude &&
      courier.currentLongitude &&
      order.latitude &&
      order.longitude
    ) {
      const courierToCustomer = this.calculateDistance(
        Number(courier.currentLatitude),
        Number(courier.currentLongitude),
        Number(order.latitude),
        Number(order.longitude),
      );

      // Score based on distance: 0-2km = 100, 2-5km = 70-100, 5-10km = 40-70, >10km = 0-40
      if (courierToCustomer <= 2) {
        distanceScore = 100;
      } else if (courierToCustomer <= 5) {
        distanceScore = 100 - ((courierToCustomer - 2) / 3) * 30;
      } else if (courierToCustomer <= 10) {
        distanceScore = 70 - ((courierToCustomer - 5) / 5) * 30;
      } else {
        distanceScore = Math.max(0, 40 - (courierToCustomer - 10) * 4);
      }
    } else if (
      courier.currentLatitude &&
      courier.currentLongitude &&
      order.branch
    ) {
      // Use branch location as fallback
      const courierToBranch = this.calculateDistance(
        Number(courier.currentLatitude),
        Number(courier.currentLongitude),
        Number(order.branch.latitude),
        Number(order.branch.longitude),
      );

      if (courierToBranch <= 1) {
        distanceScore = 80;
      } else if (courierToBranch <= 3) {
        distanceScore = 60;
      } else {
        distanceScore = Math.max(20, 60 - courierToBranch * 5);
      }
    }

    // Load Score (0-100): fewer active orders is better
    const activeOrders = courier._count?.orders || 0;
    let loadScore = 100;
    if (activeOrders === 1) {
      loadScore = 70;
    } else if (activeOrders === 2) {
      loadScore = 40;
    } else if (activeOrders >= 3) {
      loadScore = 10;
    }

    // Performance Score (0-100): based on courier's performance score (0-100)
    const performanceScore = Math.min(100, Math.max(0, courier.performanceScore));

    // Returning Score (0-100): returning couriers get bonus
    let returningScore = 50; // neutral for available couriers
    if (courier.status === CourierStatus.RETURNING) {
      // Check if returning toward this delivery location
      if (
        courier.currentLatitude &&
        courier.currentLongitude &&
        order.latitude &&
        order.longitude
      ) {
        const distanceToDelivery = this.calculateDistance(
          Number(courier.currentLatitude),
          Number(courier.currentLongitude),
          Number(order.latitude),
          Number(order.longitude),
        );

        // If returning and close to the delivery location, give high score
        if (distanceToDelivery <= 3) {
          returningScore = 100;
        } else if (distanceToDelivery <= 5) {
          returningScore = 80;
        } else {
          returningScore = 60;
        }
      } else {
        returningScore = 70; // general bonus for returning status
      }
    }

    return {
      distance: Math.round(distanceScore),
      load: Math.round(loadScore),
      performance: Math.round(performanceScore),
      returning: Math.round(returningScore),
    };
  }

  // ============================================================================
  // DELIVERY COMPLETION
  // ============================================================================

  /**
   * Complete a delivery and update all related records
   */
  async completeDelivery(orderId: number, courierId: number, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        courier: true,
        branch: { select: { latitude: true, longitude: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.courierId !== courierId) {
      throw new BadRequestException(
        `Order ${orderId} is not assigned to courier ${courierId}`,
      );
    }

    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException(`Order ${orderId} is already delivered`);
    }

    const now = new Date();
    const pickedUpAt = order.pickedUpAt || order.readyAt || order.createdAt;
    const deliveryDuration = Math.round(
      (now.getTime() - pickedUpAt.getTime()) / 60000,
    ); // in minutes

    const result = await this.prisma.executeInTransaction(async (tx) => {
      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: now,
          deliveryDuration,
          paymentStatus: 'PAID',
        },
        include: {
          courier: {
            include: {
              user: { select: { name: true } },
            },
          },
          customer: { select: { name: true, phone: true } },
        },
      });

      // Create status history entry
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.DELIVERED,
          changedById: userId ? parseInt(userId, 10) : undefined,
          note: `Delivery completed in ${deliveryDuration} minutes`,
        },
      });

      // Handle cash payment - add to courier's cash balance
      if (order.paymentMethod === PaymentMethod.CASH) {
        const cashAmount = Number(order.totalAmount);
        const currentBalance = Number(order.courier!.cashBalance);
        const newBalance = currentBalance + cashAmount;

        // Create cash transaction record
        await tx.courierCashTransaction.create({
          data: {
            courierId,
            type: 'collection',
            amount: cashAmount,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            orderId,
            note: `Cash collection for order #${order.orderNumber}`,
          },
        });

        // Update courier cash balance
        await tx.courier.update({
          where: { id: courierId },
          data: { cashBalance: newBalance },
        });
      }

      // Update courier performance metrics
      await this.updateCourierPerformance(courierId, deliveryDuration, tx);

      // Check if courier has more orders, if not set to RETURNING
      const activeOrdersCount = await tx.order.count({
        where: {
          courierId,
          status: { in: [OrderStatus.ON_DELIVERY, OrderStatus.READY] },
        },
      });

      if (activeOrdersCount === 0) {
        await tx.courier.update({
          where: { id: courierId },
          data: { status: CourierStatus.RETURNING },
        });
      }

      return {
        order: updatedOrder,
        cashCollected:
          order.paymentMethod === PaymentMethod.CASH
            ? Number(order.totalAmount)
            : 0,
        activeOrdersRemaining: activeOrdersCount,
      };
    });

    // Emit WebSocket events
    this.deliveryGateway.emitDeliveryCompleted(
      order.branchId.toString(),
      orderId,
      {
        courierId,
        courierName: result.order.courier?.user?.name,
        deliveryDuration,
        customerName: result.order.customer?.name ?? undefined,
        totalAmount: Number(order.totalAmount),
        paymentMethod: order.paymentMethod,
      },
    );

    if (result.activeOrdersRemaining === 0) {
      this.deliveryGateway.emitCourierStatusChanged(
        order.branchId.toString(),
        courierId,
        CourierStatus.RETURNING,
        CourierStatus.ON_DELIVERY,
      );
    }

    this.logger.log(
      `Delivery completed: Order ${orderId} by courier ${courierId} in ${deliveryDuration} minutes`,
    );

    return {
      success: true,
      message: 'Delivery completed successfully',
      order: result.order,
      deliveryDuration,
      cashCollected: result.cashCollected,
      activeOrdersRemaining: result.activeOrdersRemaining,
    };
  }

  /**
   * Update courier performance metrics after delivery
   */
  async updateCourierPerformance(
    courierId: number,
    deliveryDuration: number,
    tx: Prisma.TransactionClient,
  ) {
    const courier = await tx.courier.findUnique({
      where: { id: courierId },
    });

    if (!courier) return;

    const totalDeliveries = courier.totalDeliveries + 1;

    // Calculate new average delivery time using rolling average
    const currentAvg = courier.averageDeliveryTime || deliveryDuration;
    const newAvgDeliveryTime = Math.round(
      (currentAvg * courier.totalDeliveries + deliveryDuration) / totalDeliveries,
    );

    // Calculate performance score adjustment
    // On-time (< 45 min) improves score, late deliveries decrease it
    const onTimeThreshold = 45;
    let performanceAdjustment = 0;

    if (deliveryDuration <= onTimeThreshold) {
      // On-time delivery: small increase (max +2)
      performanceAdjustment = Math.min(2, Math.round((onTimeThreshold - deliveryDuration) / 15));
    } else {
      // Late delivery: decrease based on how late
      const minutesLate = deliveryDuration - onTimeThreshold;
      performanceAdjustment = -Math.min(5, Math.ceil(minutesLate / 10));
    }

    const newPerformanceScore = Math.min(
      100,
      Math.max(0, courier.performanceScore + performanceAdjustment),
    );

    await tx.courier.update({
      where: { id: courierId },
      data: {
        totalDeliveries,
        averageDeliveryTime: newAvgDeliveryTime,
        performanceScore: newPerformanceScore,
      },
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in kilometers

    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // ============================================================================
  // EXISTING DELIVERY MANAGEMENT (PRESERVED)
  // ============================================================================

  async findAll(options: FindAllOptions = {}) {
    const { page = 1, limit = 20, status, branchId } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;

    const [deliveries, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take,
        where: {
          ...where,
          status: { in: [OrderStatus.ON_DELIVERY, OrderStatus.DELIVERED] },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          courier: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({
        where: {
          ...where,
          status: { in: [OrderStatus.ON_DELIVERY, OrderStatus.DELIVERED] },
        },
      }),
    ]);

    return {
      items: deliveries,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  async getActiveDeliveries(branchId?: string) {
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.ON_DELIVERY,
    };
    if (branchId) where.branchId = parseInt(branchId, 10);

    return this.prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        courier: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        customer: true,
        items: { include: { product: true } },
        courier: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        branch: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Delivery with ID ${id} not found`);
    }

    return order;
  }

  async create(data: unknown, userId: string) {
    const deliveryData = data as {
      orderId: number;
      branchId: number;
      address: string;
      latitude?: number;
      longitude?: number;
      notes?: string;
    };

    // Update order for delivery
    const order = await this.prisma.order.update({
      where: { id: deliveryData.orderId },
      data: {
        customerAddress: deliveryData.address,
        latitude: deliveryData.latitude,
        longitude: deliveryData.longitude,
        status: OrderStatus.READY,
      },
    });

    this.logger.log(`Delivery created for order: ${order.id}`);
    return order;
  }

  async assignDriver(id: string, driverId: string) {
    const order = await this.findOne(id);

    const updated = await this.prisma.order.update({
      where: { id: parseInt(id, 10) },
      data: {
        courierId: parseInt(driverId, 10),
        status: OrderStatus.ON_DELIVERY,
      },
      include: {
        courier: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    this.deliveryGateway.emitDeliveryAssigned(order.branchId.toString(), updated);
    this.logger.log(`Order ${id} assigned to courier ${driverId}`);

    return updated;
  }

  async updateStatus(id: string, status: string, userId: string) {
    const order = await this.findOne(id);

    const updateData: Prisma.OrderUpdateInput = {
      status: status as OrderStatus,
    };

    if (status === 'ON_DELIVERY') {
      updateData.pickedUpAt = new Date();
    } else if (status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    const updated = await this.prisma.order.update({
      where: { id: parseInt(id, 10) },
      data: updateData,
    });

    this.deliveryGateway.emitDeliveryStatusChanged(order.branchId.toString(), id, status);
    this.logger.log(`Order ${id} status changed to ${status}`);

    return updated;
  }

  async updateLocation(
    id: string,
    location: { latitude: number; longitude: number },
  ) {
    const order = await this.findOne(id);

    if (order.courier) {
      await this.prisma.courier.update({
        where: { id: order.courier.id },
        data: {
          currentLatitude: location.latitude,
          currentLongitude: location.longitude,
          lastLocationAt: new Date(),
        },
      });
    }

    this.deliveryGateway.emitLocationUpdate(order.branchId.toString(), id, location);

    return { message: 'Location updated' };
  }
}
