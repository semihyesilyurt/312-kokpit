/**
 * Report Service
 * Comprehensive reporting and analytics with Redis caching
 *
 * KPI Formulas:
 * - Net Kar = Siparis Tutari - Komisyon - Hammadde - Kurye Maliyeti
 * - Fire Orani = (Fiili - Teorik Stok) / Teorik Stok x 100
 * - Gec Teslim Orani = Gec Teslim Sayisi / Toplam Teslim x 100
 * - Direkt Musteri Orani = Direkt Siparisler / Toplam Siparisler x 100
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  DashboardQueryDto,
  KpisQueryDto,
  SalesReportQueryDto,
  PlatformComparisonQueryDto,
  ProductPerformanceQueryDto,
  CourierPerformanceQueryDto,
  ProfitabilityQueryDto,
  GenerateDailyReportDto,
  ExportReportQueryDto,
  ReportGroupBy,
  SummaryQueryDto,
  DateRange,
} from './dto/report-query.dto';

// Cache TTL constants (in seconds)
const DASHBOARD_CACHE_TTL = 300; // 5 minutes
const KPI_CACHE_TTL = 300; // 5 minutes

export interface DashboardData {
  todayOrders: number;
  todayRevenue: number;
  todayNetProfit: number;
  averageDeliveryTime: number | null;
  ordersChangePercent: number;
  revenueChangePercent: number;
  activeOrders: number;
  availableCouriers: number;
  criticalStockCount: number;
  sleepingCustomers: number;
  ordersByPlatform: Array<{ platform: string; count: number; revenue: number }>;
  alerts: Array<{ type: string; message: string; severity: string }>;
}

export interface KpiData {
  netProfit: number;
  netProfitMargin: number;
  wasteRate: number;
  lateDeliveryRate: number;
  directCustomerRate: number;
  averageOrderValue: number;
  ordersPerHour: number;
  customerRetentionRate: number;
  platformCommissionTotal: number;
  rawMaterialCost: number;
  courierCost: number;
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Convert date range preset to start/end dates
   */
  private getDateRangeFromPreset(range: DateRange): { startDate: Date; endDate: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);

    switch (range) {
      case DateRange.TODAY:
        return { startDate: today, endDate: endOfToday };

      case DateRange.YESTERDAY: {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const endOfYesterday = new Date(today.getTime() - 1);
        return { startDate: yesterday, endDate: endOfYesterday };
      }

      case DateRange.THIS_WEEK: {
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        return { startDate: startOfWeek, endDate: endOfToday };
      }

      case DateRange.LAST_WEEK: {
        const dayOfWeek = today.getDay();
        const startOfThisWeek = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
        const endOfLastWeek = new Date(startOfThisWeek.getTime() - 1);
        return { startDate: startOfLastWeek, endDate: endOfLastWeek };
      }

      case DateRange.THIS_MONTH: {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: startOfMonth, endDate: endOfToday };
      }

      case DateRange.LAST_MONTH: {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { startDate: startOfLastMonth, endDate: endOfLastMonth };
      }

      case DateRange.LAST_7_DAYS: {
        const start = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
        return { startDate: start, endDate: endOfToday };
      }

      case DateRange.LAST_30_DAYS: {
        const start = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
        return { startDate: start, endDate: endOfToday };
      }

      default:
        return { startDate: today, endDate: endOfToday };
    }
  }

  /**
   * Get summary report with date range presets
   */
  async getSummary(queryDto: SummaryQueryDto) {
    const range = queryDto.range || DateRange.TODAY;
    const { startDate, endDate } = this.getDateRangeFromPreset(range);

    const dashboardQuery: DashboardQueryDto = {
      branchId: queryDto.branchId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    const dashboardData = await this.getDashboard(dashboardQuery);

    return {
      range,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      ...dashboardData,
    };
  }

  /**
   * Get dashboard summary data with Redis caching
   */
  async getDashboard(queryDto: DashboardQueryDto): Promise<DashboardData> {
    const { branchId, startDate, endDate } = queryDto;
    const cacheKey = `dashboard:${branchId || 'all'}:${startDate || 'today'}:${endDate || 'today'}`;

    // Check cache first (non-blocking on cache errors)
    try {
      const cached = await this.cacheManager.get<DashboardData>(cacheKey);
      if (cached) {
        this.logger.debug(`Dashboard cache hit: ${cacheKey}`);
        return cached;
      }
    } catch (error) {
      this.logger.warn(`Cache get error: ${error}`);
    }

    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

    const baseWhere: Prisma.OrderWhereInput = {};
    if (branchId) baseWhere.branchId = branchId;

    const todayWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      createdAt: { gte: startOfToday, lte: endOfToday },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };

    const yesterdayWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      createdAt: { gte: startOfYesterday, lte: endOfYesterday },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };

    const [
      todayOrders,
      yesterdayOrders,
      activeOrders,
      availableCouriers,
      criticalStockCount,
      sleepingCustomers,
      ordersByPlatform,
      avgDeliveryTime,
    ] = await Promise.all([
      // Today's orders and revenue
      this.prisma.order.aggregate({
        where: todayWhere,
        _count: { id: true },
        _sum: { totalAmount: true, netAmount: true, platformCommission: true },
      }),

      // Yesterday's orders and revenue for comparison
      this.prisma.order.aggregate({
        where: yesterdayWhere,
        _count: { id: true },
        _sum: { totalAmount: true },
      }),

      // Active orders count
      this.prisma.order.count({
        where: {
          ...baseWhere,
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_DELIVERY'] },
        },
      }),

      // Available couriers
      this.prisma.courier.count({
        where: {
          ...(branchId ? { branchId } : {}),
          status: 'AVAILABLE',
          isOnShift: true,
        },
      }),

      // Placeholder - critical stock calculated via raw query below
      Promise.resolve(0),

      // Sleeping customers (no order in 30+ days)
      this.prisma.customer.count({
        where: {
          status: 'SLEEPING',
        },
      }),

      // Orders by platform
      this.prisma.order.groupBy({
        by: ['platform'],
        where: todayWhere,
        _count: { id: true },
        _sum: { totalAmount: true },
      }),

      // Average delivery time
      this.prisma.order.aggregate({
        where: {
          ...todayWhere,
          status: 'DELIVERED',
          deliveryDuration: { not: null },
        },
        _avg: { deliveryDuration: true },
      }),
    ]);

    // Calculate critical stock properly
    const criticalStock = await this.prisma.stockItem.count({
      where: {
        ...(branchId ? { branchId } : {}),
      },
    });

    const stockBelowMinimum = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM stock_items
      WHERE currentStock <= minStock
      ${branchId ? Prisma.sql`AND branchId = ${branchId}` : Prisma.empty}
    `;

    // Calculate raw material cost for today
    const rawMaterialCost = await this.calculateRawMaterialCost(startOfToday, endOfToday, branchId);

    // Calculate net profit
    const grossRevenue = Number(todayOrders._sum.totalAmount || 0);
    const commission = Number(todayOrders._sum.platformCommission || 0);
    const netProfit = grossRevenue - commission - rawMaterialCost;

    // Calculate change percentages
    const yesterdayOrderCount = yesterdayOrders._count.id || 1;
    const yesterdayRevenue = Number(yesterdayOrders._sum.totalAmount || 1);

    const ordersChangePercent = ((todayOrders._count.id - yesterdayOrderCount) / yesterdayOrderCount) * 100;
    const revenueChangePercent = ((grossRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;

    // Generate alerts
    const alerts = await this.generateAlerts(branchId);

    const dashboardData: DashboardData = {
      todayOrders: todayOrders._count.id || 0,
      todayRevenue: grossRevenue,
      todayNetProfit: netProfit,
      averageDeliveryTime: avgDeliveryTime._avg.deliveryDuration
        ? Math.round(avgDeliveryTime._avg.deliveryDuration)
        : null,
      ordersChangePercent: Number(ordersChangePercent.toFixed(2)),
      revenueChangePercent: Number(revenueChangePercent.toFixed(2)),
      activeOrders,
      availableCouriers,
      criticalStockCount: Number(stockBelowMinimum[0]?.count || 0),
      sleepingCustomers,
      ordersByPlatform: ordersByPlatform.map((p) => ({
        platform: p.platform,
        count: p._count.id,
        revenue: Number(p._sum.totalAmount || 0),
      })),
      alerts,
    };

    // Cache the result (non-blocking on cache errors)
    try {
      await this.cacheManager.set(cacheKey, dashboardData, DASHBOARD_CACHE_TTL * 1000);
      this.logger.debug(`Dashboard cached: ${cacheKey}`);
    } catch (error) {
      this.logger.warn(`Cache set error: ${error}`);
    }

    return dashboardData;
  }

  /**
   * Get KPI metrics with Redis caching
   */
  async getKpis(queryDto: KpisQueryDto): Promise<KpiData> {
    const { branchId, startDate, endDate } = queryDto;
    const cacheKey = `kpis:${branchId || 'all'}:${startDate || 'today'}:${endDate || 'today'}`;

    // Check cache first (non-blocking on cache errors)
    try {
      const cached = await this.cacheManager.get<KpiData>(cacheKey);
      if (cached) {
        this.logger.debug(`KPIs cache hit: ${cacheKey}`);
        return cached;
      }
    } catch (error) {
      this.logger.warn(`Cache get error: ${error}`);
    }

    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate) : new Date(new Date().setHours(23, 59, 59, 999));

    const baseWhere: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };
    if (branchId) baseWhere.branchId = branchId;

    const [
      orderStats,
      deliveredOrders,
      lateDeliveries,
      directOrders,
      totalCustomers,
      returningCustomers,
      wasteMovements,
      stockComparison,
    ] = await Promise.all([
      // Order statistics
      this.prisma.order.aggregate({
        where: baseWhere,
        _count: { id: true },
        _sum: {
          totalAmount: true,
          netAmount: true,
          platformCommission: true,
        },
        _avg: { totalAmount: true },
      }),

      // Delivered orders count
      this.prisma.order.count({
        where: { ...baseWhere, status: 'DELIVERED' },
      }),

      // Late deliveries (delivery time > estimated)
      this.prisma.order.count({
        where: {
          ...baseWhere,
          status: 'DELIVERED',
          actualDelivery: { not: null },
          estimatedDelivery: { not: null },
        },
      }),

      // Direct orders
      this.prisma.order.count({
        where: { ...baseWhere, platform: { in: ['DIRECT', 'POS'] } },
      }),

      // Total customers in period
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Returning customers (>1 order)
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM (
          SELECT customerId FROM orders
          WHERE createdAt >= ${start} AND createdAt <= ${end}
          AND status NOT IN ('CANCELLED', 'REFUNDED')
          ${branchId ? Prisma.sql`AND branchId = ${branchId}` : Prisma.empty}
          GROUP BY customerId HAVING COUNT(*) > 1
        ) as returning_customers
      `,

      // Waste movements for fire rate
      this.prisma.stockMovement.aggregate({
        where: {
          type: 'WASTE',
          createdAt: { gte: start, lte: end },
          ...(branchId ? { branchId } : {}),
        },
        _sum: { totalCost: true },
      }),

      // Stock theoretical vs actual for fire rate calculation
      this.prisma.stockItem.aggregate({
        where: branchId ? { branchId } : {},
        _sum: { currentStock: true, theoreticalStock: true },
      }),
    ]);

    // Calculate raw material cost
    const rawMaterialCost = await this.calculateRawMaterialCost(start, end, branchId);

    // Calculate courier cost (simplified - could be from courier transactions)
    const courierCost = deliveredOrders * 5; // Approximate cost per delivery

    // Calculate KPIs
    const totalRevenue = Number(orderStats._sum.totalAmount || 0);
    const platformCommission = Number(orderStats._sum.platformCommission || 0);
    const netProfit = totalRevenue - platformCommission - rawMaterialCost - courierCost;
    const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Fire rate (waste rate)
    const currentStock = Number(stockComparison._sum.currentStock || 0);
    const theoreticalStock = Number(stockComparison._sum.theoreticalStock || 1);
    const wasteRate = theoreticalStock > 0
      ? ((theoreticalStock - currentStock) / theoreticalStock) * 100
      : 0;

    // Late delivery rate (need to query late deliveries properly)
    const lateDeliveryQuery = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM orders
      WHERE status = 'DELIVERED'
      AND actualDelivery > estimatedDelivery
      AND createdAt >= ${start} AND createdAt <= ${end}
      ${branchId ? Prisma.sql`AND branchId = ${branchId}` : Prisma.empty}
    `;
    const lateDeliveryCount = Number(lateDeliveryQuery[0]?.count || 0);
    const lateDeliveryRate = deliveredOrders > 0
      ? (lateDeliveryCount / deliveredOrders) * 100
      : 0;

    // Direct customer rate
    const totalOrders = orderStats._count.id || 0;
    const directCustomerRate = totalOrders > 0
      ? (directOrders / totalOrders) * 100
      : 0;

    // Customer retention rate
    const totalUniqueCustomers = totalCustomers.length;
    const returningCount = Number(returningCustomers[0]?.count || 0);
    const customerRetentionRate = totalUniqueCustomers > 0
      ? (returningCount / totalUniqueCustomers) * 100
      : 0;

    // Orders per hour
    const hoursDiff = Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60), 1);
    const ordersPerHour = totalOrders / hoursDiff;

    const kpiData: KpiData = {
      netProfit: Number(netProfit.toFixed(2)),
      netProfitMargin: Number(netProfitMargin.toFixed(2)),
      wasteRate: Number(wasteRate.toFixed(2)),
      lateDeliveryRate: Number(lateDeliveryRate.toFixed(2)),
      directCustomerRate: Number(directCustomerRate.toFixed(2)),
      averageOrderValue: Number(orderStats._avg.totalAmount || 0),
      ordersPerHour: Number(ordersPerHour.toFixed(2)),
      customerRetentionRate: Number(customerRetentionRate.toFixed(2)),
      platformCommissionTotal: platformCommission,
      rawMaterialCost,
      courierCost,
    };

    // Cache the result (non-blocking on cache errors)
    try {
      await this.cacheManager.set(cacheKey, kpiData, KPI_CACHE_TTL * 1000);
      this.logger.debug(`KPIs cached: ${cacheKey}`);
    } catch (error) {
      this.logger.warn(`Cache set error: ${error}`);
    }

    return kpiData;
  }

  /**
   * Get detailed sales report
   */
  async getSalesReport(queryDto: SalesReportQueryDto) {
    const { branchId, startDate, endDate, groupBy = ReportGroupBy.DAY, platform } = queryDto;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };
    if (branchId) where.branchId = branchId;
    if (platform) where.platform = platform as any;

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        netAmount: true,
        platformCommission: true,
        discount: true,
        deliveryFee: true,
        createdAt: true,
        platform: true,
        paymentMethod: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by time period
    const grouped = this.groupOrdersByPeriod(orders, groupBy);

    // Calculate summary
    const totalSales = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalNet = orders.reduce((sum, o) => sum + Number(o.netAmount || 0), 0);
    const totalCommission = orders.reduce((sum, o) => sum + Number(o.platformCommission || 0), 0);
    const totalDiscount = orders.reduce((sum, o) => sum + Number(o.discount || 0), 0);

    return {
      summary: {
        totalSales,
        totalNet,
        totalCommission,
        totalDiscount,
        orderCount: orders.length,
        averageOrderValue: orders.length > 0 ? totalSales / orders.length : 0,
      },
      data: grouped,
      period: { start: start.toISOString(), end: end.toISOString() },
      currency: 'TRY',
    };
  }

  /**
   * Get platform comparison report
   */
  async getPlatformComparison(queryDto: PlatformComparisonQueryDto) {
    const { branchId, startDate, endDate } = queryDto;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };
    if (branchId) where.branchId = branchId;

    const [platformStats, avgDeliveryByPlatform] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['platform'],
        where,
        _count: { id: true },
        _sum: { totalAmount: true, netAmount: true, platformCommission: true },
        _avg: { totalAmount: true, deliveryDuration: true },
      }),
      this.prisma.order.groupBy({
        by: ['platform'],
        where: { ...where, status: 'DELIVERED', deliveryDuration: { not: null } },
        _avg: { deliveryDuration: true },
      }),
    ]);

    const deliveryMap = new Map(avgDeliveryByPlatform.map((p) => [p.platform, p._avg.deliveryDuration]));

    return {
      platforms: platformStats.map((p) => ({
        platform: p.platform,
        orderCount: p._count.id,
        totalRevenue: Number(p._sum.totalAmount || 0),
        netRevenue: Number(p._sum.netAmount || 0),
        commission: Number(p._sum.platformCommission || 0),
        averageOrderValue: Number(p._avg.totalAmount || 0),
        averageDeliveryTime: deliveryMap.get(p.platform)
          ? Math.round(Number(deliveryMap.get(p.platform)))
          : null,
        revenueShare: 0, // Will calculate below
      })),
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  /**
   * Get product performance report
   */
  async getProductPerformance(queryDto: ProductPerformanceQueryDto) {
    const { branchId, startDate, endDate, categoryId, limit = 20 } = queryDto;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const orderWhere: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };
    if (branchId) orderWhere.branchId = branchId;

    const itemWhere: Prisma.OrderItemWhereInput = {
      order: orderWhere,
    };
    if (categoryId) {
      itemWhere.product = { categoryId };
    }

    const productSales = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: itemWhere,
      _sum: { quantity: true, totalPrice: true, cost: true },
      _count: { id: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: limit,
    });

    const productIds = productSales.map((p) => p.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, category: { select: { name: true } }, imageUrl: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return {
      products: productSales.map((ps) => {
        const product = productMap.get(ps.productId);
        const revenue = Number(ps._sum.totalPrice || 0);
        const cost = Number(ps._sum.cost || 0);
        const profit = revenue - cost;

        return {
          productId: ps.productId,
          name: product?.name || 'Unknown',
          category: product?.category?.name || 'Unknown',
          imageUrl: product?.imageUrl,
          quantitySold: ps._sum.quantity || 0,
          orderCount: ps._count.id,
          revenue,
          cost,
          profit,
          profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0,
        };
      }),
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  /**
   * Get courier performance report
   */
  async getCourierPerformance(queryDto: CourierPerformanceQueryDto) {
    const { branchId, startDate, endDate, courierId } = queryDto;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
      status: 'DELIVERED',
      courierId: { not: null },
    };
    if (branchId) where.branchId = branchId;
    if (courierId) where.courierId = courierId;

    const courierStats = await this.prisma.order.groupBy({
      by: ['courierId'],
      where,
      _count: { id: true },
      _avg: { deliveryDuration: true },
    });

    const courierIds = courierStats.map((c) => c.courierId!);
    const couriers = await this.prisma.courier.findMany({
      where: { id: { in: courierIds } },
      include: { user: { select: { name: true, phone: true } } },
    });

    const courierMap = new Map(couriers.map((c) => [c.id, c]));

    // Calculate late deliveries per courier
    const lateDeliveries = await this.prisma.$queryRaw<Array<{ courierId: number; late_count: bigint }>>`
      SELECT courierId, COUNT(*) as late_count FROM orders
      WHERE status = 'DELIVERED'
      AND actualDelivery > estimatedDelivery
      AND courierId IS NOT NULL
      AND createdAt >= ${start} AND createdAt <= ${end}
      ${branchId ? Prisma.sql`AND branchId = ${branchId}` : Prisma.empty}
      ${courierId ? Prisma.sql`AND courierId = ${courierId}` : Prisma.empty}
      GROUP BY courierId
    `;

    const lateMap = new Map(lateDeliveries.map((l) => [l.courierId, Number(l.late_count)]));

    return {
      couriers: courierStats.map((cs) => {
        const courier = courierMap.get(cs.courierId!);
        const deliveryCount = cs._count.id;
        const lateCount = lateMap.get(cs.courierId!) || 0;

        return {
          courierId: cs.courierId,
          name: courier?.user.name || 'Unknown',
          phone: courier?.user.phone,
          totalDeliveries: deliveryCount,
          averageDeliveryTime: cs._avg.deliveryDuration
            ? Math.round(cs._avg.deliveryDuration)
            : null,
          lateDeliveries: lateCount,
          onTimeRate: deliveryCount > 0
            ? ((deliveryCount - lateCount) / deliveryCount) * 100
            : 100,
          rating: courier?.rating ? Number(courier.rating) : null,
          performanceScore: courier?.performanceScore || 0,
        };
      }),
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  /**
   * Get profitability analysis report
   */
  async getProfitability(queryDto: ProfitabilityQueryDto) {
    const { branchId, startDate, endDate, groupBy = ReportGroupBy.DAY } = queryDto;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };
    if (branchId) where.branchId = branchId;

    // Get orders with items for cost calculation
    const orders = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        netAmount: true,
        platformCommission: true,
        deliveryFee: true,
        createdAt: true,
        platform: true,
        items: {
          select: { cost: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate profitability for each order
    const ordersWithProfit = orders.map((order) => {
      const revenue = Number(order.totalAmount || 0);
      const commission = Number(order.platformCommission || 0);
      const rawMaterialCost = order.items.reduce((sum, item) => sum + Number(item.cost || 0), 0);
      const deliveryCost = 5; // Approximate fixed cost per delivery
      const netProfit = revenue - commission - rawMaterialCost - deliveryCost;

      return {
        ...order,
        rawMaterialCost,
        deliveryCost,
        netProfit,
        profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      };
    });

    // Group by time period
    const grouped = this.groupProfitByPeriod(ordersWithProfit, groupBy);

    // Calculate summary
    const totalRevenue = ordersWithProfit.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalCommission = ordersWithProfit.reduce((sum, o) => sum + Number(o.platformCommission || 0), 0);
    const totalRawMaterial = ordersWithProfit.reduce((sum, o) => sum + o.rawMaterialCost, 0);
    const totalDeliveryCost = ordersWithProfit.reduce((sum, o) => sum + o.deliveryCost, 0);
    const totalNetProfit = ordersWithProfit.reduce((sum, o) => sum + o.netProfit, 0);

    return {
      summary: {
        totalRevenue,
        totalCommission,
        totalRawMaterialCost: totalRawMaterial,
        totalDeliveryCost,
        totalNetProfit,
        averageProfitMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
        orderCount: orders.length,
      },
      data: grouped,
      period: { start: start.toISOString(), end: end.toISOString() },
      currency: 'TRY',
    };
  }

  /**
   * Generate daily report for a specific date
   */
  async generateDailyReport(dto: GenerateDailyReportDto) {
    const reportDate = dto.date ? new Date(dto.date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfDay = new Date(reportDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(reportDate.setHours(23, 59, 59, 999));

    // Get branches to generate reports for
    const branches = dto.branchId
      ? await this.prisma.branch.findMany({ where: { id: dto.branchId } })
      : await this.prisma.branch.findMany({ where: { isActive: true } });

    const reports = [];

    for (const branch of branches) {
      const where: Prisma.OrderWhereInput = {
        branchId: branch.id,
        createdAt: { gte: startOfDay, lte: endOfDay },
      };

      const [
        orderStats,
        platformBreakdown,
        cancelledCount,
        refundedCount,
        newCustomers,
        returningCustomers,
        topProducts,
        wasteAmount,
      ] = await Promise.all([
        this.prisma.order.aggregate({
          where: { ...where, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
          _count: { id: true },
          _sum: { totalAmount: true, netAmount: true, platformCommission: true, discount: true, deliveryFee: true },
          _avg: { totalAmount: true, deliveryDuration: true },
        }),
        this.prisma.order.groupBy({
          by: ['platform'],
          where: { ...where, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
          _count: { id: true },
        }),
        this.prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
        this.prisma.order.count({ where: { ...where, status: 'REFUNDED' } }),
        this.prisma.customer.count({
          where: { firstOrderAt: { gte: startOfDay, lte: endOfDay } },
        }),
        this.prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(DISTINCT customerId) as count FROM orders
          WHERE branchId = ${branch.id}
          AND createdAt >= ${startOfDay} AND createdAt <= ${endOfDay}
          AND customerId IN (
            SELECT customerId FROM orders
            WHERE createdAt < ${startOfDay}
          )
        `,
        this.prisma.orderItem.groupBy({
          by: ['productId'],
          where: { order: where },
          _sum: { quantity: true, totalPrice: true },
          orderBy: { _sum: { totalPrice: 'desc' } },
          take: 10,
        }),
        this.prisma.stockMovement.aggregate({
          where: {
            branchId: branch.id,
            type: 'WASTE',
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
          _sum: { totalCost: true },
        }),
      ]);

      // Get product names for top products
      const productIds = topProducts.map((p) => p.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p.name]));

      const platformOrders: Record<string, number> = {};
      platformBreakdown.forEach((p) => {
        platformOrders[p.platform.toLowerCase()] = p._count.id;
      });

      // Upsert the daily report
      const report = await this.prisma.dailyReport.upsert({
        where: {
          branchId_date: {
            branchId: branch.id,
            date: startOfDay,
          },
        },
        create: {
          branchId: branch.id,
          date: startOfDay,
          totalOrders: orderStats._count.id || 0,
          platformOrders,
          posOrders: platformOrders['pos'] || 0,
          directOrders: platformOrders['direct'] || 0,
          cancelledOrders: cancelledCount,
          refundedOrders: refundedCount,
          grossRevenue: orderStats._sum.totalAmount || 0,
          netRevenue: orderStats._sum.netAmount || 0,
          platformCommissions: orderStats._sum.platformCommission || 0,
          totalDiscount: orderStats._sum.discount || 0,
          totalDeliveryFees: orderStats._sum.deliveryFee || 0,
          averageOrderValue: orderStats._avg.totalAmount,
          averageDeliveryTime: orderStats._avg.deliveryDuration
            ? Math.round(orderStats._avg.deliveryDuration)
            : null,
          wasteAmount: wasteAmount._sum.totalCost,
          newCustomers,
          returningCustomers: Number(returningCustomers[0]?.count || 0),
          topProducts: topProducts.map((tp) => ({
            productId: tp.productId,
            name: productMap.get(tp.productId) || 'Unknown',
            quantity: tp._sum.quantity,
            revenue: tp._sum.totalPrice,
          })),
        },
        update: {
          totalOrders: orderStats._count.id || 0,
          platformOrders,
          posOrders: platformOrders['pos'] || 0,
          directOrders: platformOrders['direct'] || 0,
          cancelledOrders: cancelledCount,
          refundedOrders: refundedCount,
          grossRevenue: orderStats._sum.totalAmount || 0,
          netRevenue: orderStats._sum.netAmount || 0,
          platformCommissions: orderStats._sum.platformCommission || 0,
          totalDiscount: orderStats._sum.discount || 0,
          totalDeliveryFees: orderStats._sum.deliveryFee || 0,
          averageOrderValue: orderStats._avg.totalAmount,
          averageDeliveryTime: orderStats._avg.deliveryDuration
            ? Math.round(orderStats._avg.deliveryDuration)
            : null,
          wasteAmount: wasteAmount._sum.totalCost,
          newCustomers,
          returningCustomers: Number(returningCustomers[0]?.count || 0),
          topProducts: topProducts.map((tp) => ({
            productId: tp.productId,
            name: productMap.get(tp.productId) || 'Unknown',
            quantity: tp._sum.quantity,
            revenue: tp._sum.totalPrice,
          })),
        },
      });

      reports.push(report);
      this.logger.log(`Daily report generated for branch ${branch.id} on ${startOfDay.toISOString()}`);
    }

    return {
      message: 'Daily reports generated successfully',
      date: startOfDay.toISOString(),
      reportsGenerated: reports.length,
      reports,
    };
  }

  /**
   * Export report data
   */
  async exportReport(queryDto: ExportReportQueryDto) {
    const { reportType = 'sales', format = 'csv', branchId, startDate, endDate } = queryDto;

    // Get the report data based on type
    let data: any;
    switch (reportType) {
      case 'sales':
        data = await this.getSalesReport({ branchId, startDate, endDate });
        break;
      case 'products':
        data = await this.getProductPerformance({ branchId, startDate, endDate });
        break;
      case 'couriers':
        data = await this.getCourierPerformance({ branchId, startDate, endDate });
        break;
      case 'platforms':
        data = await this.getPlatformComparison({ branchId, startDate, endDate });
        break;
      case 'profitability':
        data = await this.getProfitability({ branchId, startDate, endDate });
        break;
      default:
        data = await this.getSalesReport({ branchId, startDate, endDate });
    }

    // For now, return the data with export metadata
    // In a real implementation, you would convert to the requested format
    return {
      format,
      reportType,
      generatedAt: new Date().toISOString(),
      data,
      // In production: downloadUrl, fileSize, etc.
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async calculateRawMaterialCost(
    start: Date,
    end: Date,
    branchId?: number,
  ): Promise<number> {
    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };
    if (branchId) where.branchId = branchId;

    const orderCosts = await this.prisma.orderItem.aggregate({
      where: { order: where },
      _sum: { cost: true },
    });

    return Number(orderCosts._sum.cost || 0);
  }

  private async generateAlerts(
    branchId?: number,
  ): Promise<Array<{ type: string; message: string; severity: string }>> {
    const alerts: Array<{ type: string; message: string; severity: string }> = [];

    // Check for critical stock levels
    const criticalStock = await this.prisma.$queryRaw<Array<{ name: string; current: number; min: number }>>`
      SELECT i.name, si.currentStock as current, si.minStock as min
      FROM stock_items si
      JOIN ingredients i ON si.ingredientId = i.id
      WHERE si.currentStock <= si.minStock
      ${branchId ? Prisma.sql`AND si.branchId = ${branchId}` : Prisma.empty}
      LIMIT 5
    `;

    for (const stock of criticalStock) {
      alerts.push({
        type: 'CRITICAL_STOCK',
        message: `${stock.name}: Stok seviyesi kritik (${stock.current}/${stock.min})`,
        severity: stock.current === 0 ? 'critical' : 'warning',
      });
    }

    // Check for too many pending orders
    const pendingOrders = await this.prisma.order.count({
      where: {
        ...(branchId ? { branchId } : {}),
        status: 'PENDING',
        createdAt: { lte: new Date(Date.now() - 15 * 60 * 1000) }, // Older than 15 min
      },
    });

    if (pendingOrders > 0) {
      alerts.push({
        type: 'DELAYED_ORDERS',
        message: `${pendingOrders} siparis 15 dakikadan fazla beklemede`,
        severity: pendingOrders > 5 ? 'critical' : 'warning',
      });
    }

    // Check for available couriers
    const availableCouriers = await this.prisma.courier.count({
      where: {
        ...(branchId ? { branchId } : {}),
        status: 'AVAILABLE',
        isOnShift: true,
      },
    });

    if (availableCouriers === 0) {
      alerts.push({
        type: 'NO_COURIERS',
        message: 'Musait kurye bulunmuyor',
        severity: 'warning',
      });
    }

    return alerts;
  }

  private groupOrdersByPeriod(
    orders: Array<{
      createdAt: Date;
      totalAmount: Prisma.Decimal | null;
      netAmount: Prisma.Decimal | null;
      platformCommission: Prisma.Decimal | null;
    }>,
    groupBy: ReportGroupBy,
  ) {
    const groups = new Map<
      string,
      { count: number; revenue: number; net: number; commission: number }
    >();

    for (const order of orders) {
      const key = this.getGroupKey(order.createdAt, groupBy);
      const existing = groups.get(key) || { count: 0, revenue: 0, net: 0, commission: 0 };
      groups.set(key, {
        count: existing.count + 1,
        revenue: existing.revenue + Number(order.totalAmount || 0),
        net: existing.net + Number(order.netAmount || 0),
        commission: existing.commission + Number(order.platformCommission || 0),
      });
    }

    return Array.from(groups.entries())
      .map(([period, data]) => ({
        period,
        ...data,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private groupProfitByPeriod(
    orders: Array<{
      createdAt: Date;
      totalAmount: Prisma.Decimal | null;
      netProfit: number;
      rawMaterialCost: number;
      platformCommission: Prisma.Decimal | null;
    }>,
    groupBy: ReportGroupBy,
  ) {
    const groups = new Map<
      string,
      { count: number; revenue: number; profit: number; cost: number; commission: number }
    >();

    for (const order of orders) {
      const key = this.getGroupKey(order.createdAt, groupBy);
      const existing = groups.get(key) || { count: 0, revenue: 0, profit: 0, cost: 0, commission: 0 };
      groups.set(key, {
        count: existing.count + 1,
        revenue: existing.revenue + Number(order.totalAmount || 0),
        profit: existing.profit + order.netProfit,
        cost: existing.cost + order.rawMaterialCost,
        commission: existing.commission + Number(order.platformCommission || 0),
      });
    }

    return Array.from(groups.entries())
      .map(([period, data]) => ({
        period,
        ...data,
        profitMargin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private getGroupKey(date: Date, groupBy: ReportGroupBy): string {
    switch (groupBy) {
      case ReportGroupBy.HOUR:
        return date.toISOString().slice(0, 13);
      case ReportGroupBy.DAY:
        return date.toISOString().slice(0, 10);
      case ReportGroupBy.WEEK:
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().slice(0, 10);
      case ReportGroupBy.MONTH:
        return date.toISOString().slice(0, 7);
      default:
        return date.toISOString().slice(0, 10);
    }
  }
}
