/**
 * Stock Service
 * Comprehensive inventory management business logic
 * Handles stock movements, recipe-based deductions, counting, and waste reporting
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
import { Prisma, StockMovementType } from '@prisma/client';
import {
  CreateStockMovementDto,
  StockMovementQueryDto,
} from './dto/stock-movement.dto';
import {
  CreateStockCountDto,
  StockCountSummaryDto,
  StockCountResultDto,
  WasteReportDto,
  WasteReportItemDto,
} from './dto/stock-count.dto';

interface FindAllOptions {
  page?: number;
  limit?: number;
  branchId?: number;
  lowStockOnly?: boolean;
}

interface OrderItem {
  productId: number;
  quantity: number;
}

export interface StockAlert {
  id: number;
  ingredientId: number;
  ingredientName: string;
  branchId: number;
  branchName: string;
  currentStock: number;
  minStock: number;
  unit: string;
  shortageAmount: number;
  severity: 'CRITICAL' | 'WARNING' | 'LOW';
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('stock') private readonly stockQueue: Queue,
  ) {}

  /**
   * Get all stock items with pagination
   */
  async findAll(options: FindAllOptions = {}) {
    const { page = 1, limit = 20, branchId, lowStockOnly } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Prisma.StockItemWhereInput = {};
    if (branchId) where.branchId = branchId;
    if (lowStockOnly) {
      where.currentStock = {
        lte: 0,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.stockItem.findMany({
        skip,
        take,
        where,
        include: {
          ingredient: {
            select: {
              id: true,
              name: true,
              unit: true,
              unitCost: true,
              minStock: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { ingredient: { name: 'asc' } },
      }),
      this.prisma.stockItem.count({ where }),
    ]);

    // Calculate fire rate for each item
    const enrichedItems = items.map((item) => ({
      ...item,
      fireRate: this.calculateFireRate(
        Number(item.currentStock),
        Number(item.theoreticalStock),
      ),
      isLowStock: Number(item.currentStock) <= Number(item.minStock),
      isCritical: Number(item.currentStock) <= Number(item.minStock) * 0.5,
    }));

    return {
      items: enrichedItems,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Get stock item by ID
   */
  async findOne(id: number) {
    const stockItem = await this.prisma.stockItem.findUnique({
      where: { id },
      include: {
        ingredient: true,
        branch: true,
      },
    });

    if (!stockItem) {
      throw new NotFoundException(`Stock item with ID ${id} not found`);
    }

    // Get recent movements
    const recentMovements = await this.prisma.stockMovement.findMany({
      where: {
        ingredientId: stockItem.ingredientId,
        branchId: stockItem.branchId,
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...stockItem,
      fireRate: this.calculateFireRate(
        Number(stockItem.currentStock),
        Number(stockItem.theoreticalStock),
      ),
      recentMovements,
    };
  }

  /**
   * Get low stock items for a branch
   */
  async getLowStock(branchId?: number) {
    const where: Prisma.StockItemWhereInput = {};
    if (branchId) where.branchId = branchId;

    const items = await this.prisma.stockItem.findMany({
      where,
      include: {
        ingredient: true,
        branch: true,
      },
    });

    return items.filter(
      (item) => Number(item.currentStock) <= Number(item.minStock),
    );
  }

  /**
   * Record a stock movement
   */
  async recordMovement(dto: CreateStockMovementDto, userId: number) {
    return this.prisma.executeInTransaction(async (tx) => {
      // Get or create stock item
      let stockItem = await tx.stockItem.findUnique({
        where: {
          ingredientId_branchId: {
            ingredientId: dto.ingredientId,
            branchId: dto.branchId,
          },
        },
        include: { ingredient: true },
      });

      if (!stockItem) {
        // Get ingredient to create stock item
        const ingredient = await tx.ingredient.findUnique({
          where: { id: dto.ingredientId },
        });

        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient with ID ${dto.ingredientId} not found`,
          );
        }

        stockItem = await tx.stockItem.create({
          data: {
            ingredientId: dto.ingredientId,
            branchId: dto.branchId,
            currentStock: 0,
            theoreticalStock: 0,
            minStock: ingredient.minStock,
          },
          include: { ingredient: true },
        });
      }

      const stockBefore = Number(stockItem.currentStock);
      let stockAfter: number;

      // Calculate new stock based on movement type
      const isIncoming = ['PURCHASE', 'TRANSFER', 'ADJUSTMENT'].includes(
        dto.type,
      );
      const quantity =
        dto.type === 'ADJUSTMENT'
          ? dto.quantity - stockBefore // Adjustment sets to exact value
          : dto.quantity;

      if (dto.type === 'ADJUSTMENT') {
        stockAfter = dto.quantity;
      } else if (isIncoming) {
        stockAfter = stockBefore + quantity;
      } else {
        stockAfter = stockBefore - quantity;
        if (stockAfter < 0) {
          throw new BadRequestException(
            `Insufficient stock. Current: ${stockBefore}, Requested: ${quantity}`,
          );
        }
      }

      // Create movement record
      const movement = await tx.stockMovement.create({
        data: {
          ingredientId: dto.ingredientId,
          branchId: dto.branchId,
          type: dto.type as StockMovementType,
          quantity: new Prisma.Decimal(Math.abs(stockAfter - stockBefore)),
          stockBefore: new Prisma.Decimal(stockBefore),
          stockAfter: new Prisma.Decimal(stockAfter),
          unitCost: dto.unitCost
            ? new Prisma.Decimal(dto.unitCost)
            : stockItem.ingredient.unitCost,
          totalCost: dto.unitCost
            ? new Prisma.Decimal(dto.unitCost * Math.abs(stockAfter - stockBefore))
            : new Prisma.Decimal(
                Number(stockItem.ingredient.unitCost) *
                  Math.abs(stockAfter - stockBefore),
              ),
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          note: dto.note,
          createdById: userId,
        },
      });

      // Update stock item
      await tx.stockItem.update({
        where: { id: stockItem.id },
        data: {
          currentStock: new Prisma.Decimal(stockAfter),
          // Also update theoretical stock for purchases and adjustments
          theoreticalStock:
            dto.type === 'PURCHASE' || dto.type === 'ADJUSTMENT'
              ? new Prisma.Decimal(stockAfter)
              : undefined,
        },
      });

      // Check for critical stock and emit event
      if (stockAfter <= Number(stockItem.minStock)) {
        await this.emitCriticalStockEvent({
          ingredientId: dto.ingredientId,
          branchId: dto.branchId,
          currentStock: stockAfter,
          minStock: Number(stockItem.minStock),
          ingredientName: stockItem.ingredient.name,
        });
      }

      this.logger.log(
        `Stock movement recorded: ${dto.type} ${dto.quantity} for ingredient ${dto.ingredientId}`,
      );

      return movement;
    });
  }

  /**
   * Deduct stock for an order based on recipes
   * Called when order is confirmed/preparing
   */
  async deductForOrder(
    orderId: number,
    items: OrderItem[],
    branchId: number,
    tx?: Prisma.TransactionClient,
  ) {
    const prisma = tx || this.prisma;

    const movements: Array<{
      ingredientId: number;
      quantity: number;
      movementId: number;
    }> = [];

    for (const item of items) {
      // Get recipe for product
      const recipeItems = await prisma.recipeItem.findMany({
        where: { productId: item.productId },
        include: {
          ingredient: {
            include: {
              stockItems: {
                where: { branchId },
              },
            },
          },
        },
      });

      for (const recipeItem of recipeItems) {
        if (!recipeItem.ingredient.trackStock) continue;

        const requiredQuantity =
          Number(recipeItem.quantity) * item.quantity;
        const stockItem = recipeItem.ingredient.stockItems[0];

        if (!stockItem) {
          this.logger.warn(
            `No stock item found for ingredient ${recipeItem.ingredientId} in branch ${branchId}`,
          );
          continue;
        }

        const stockBefore = Number(stockItem.currentStock);
        const stockAfter = stockBefore - requiredQuantity;

        // Create movement record
        const movement = await prisma.stockMovement.create({
          data: {
            ingredientId: recipeItem.ingredientId,
            branchId,
            type: 'SALE',
            quantity: new Prisma.Decimal(requiredQuantity),
            stockBefore: new Prisma.Decimal(stockBefore),
            stockAfter: new Prisma.Decimal(Math.max(0, stockAfter)),
            unitCost: recipeItem.ingredient.unitCost,
            totalCost: new Prisma.Decimal(
              Number(recipeItem.ingredient.unitCost) * requiredQuantity,
            ),
            referenceType: 'order',
            referenceId: orderId,
            note: `Order #${orderId} - Product ${item.productId} x${item.quantity}`,
          },
        });

        // Update stock item - only currentStock, not theoreticalStock (for fire calculation)
        await prisma.stockItem.update({
          where: { id: stockItem.id },
          data: {
            currentStock: new Prisma.Decimal(Math.max(0, stockAfter)),
          },
        });

        // Update theoretical stock separately for fire rate calculation
        await prisma.stockItem.update({
          where: { id: stockItem.id },
          data: {
            theoreticalStock: {
              decrement: new Prisma.Decimal(requiredQuantity),
            },
          },
        });

        movements.push({
          ingredientId: recipeItem.ingredientId,
          quantity: requiredQuantity,
          movementId: movement.id,
        });

        // Check for critical stock
        if (stockAfter <= Number(stockItem.minStock)) {
          await this.emitCriticalStockEvent({
            ingredientId: recipeItem.ingredientId,
            branchId,
            currentStock: stockAfter,
            minStock: Number(stockItem.minStock),
            ingredientName: recipeItem.ingredient.name,
          });
        }
      }
    }

    this.logger.log(
      `Stock deducted for order ${orderId}: ${movements.length} ingredients affected`,
    );

    return movements;
  }

  /**
   * Restore stock when order is cancelled
   */
  async restoreForOrder(orderId: number, tx?: Prisma.TransactionClient) {
    const prisma = tx || this.prisma;

    // Find all movements for this order
    const movements = await prisma.stockMovement.findMany({
      where: {
        referenceType: 'order',
        referenceId: orderId,
        type: 'SALE',
      },
      include: {
        ingredient: true,
      },
    });

    const restoredMovements: number[] = [];

    for (const movement of movements) {
      // Get current stock item
      const stockItem = await prisma.stockItem.findUnique({
        where: {
          ingredientId_branchId: {
            ingredientId: movement.ingredientId,
            branchId: movement.branchId,
          },
        },
      });

      if (!stockItem) continue;

      const stockBefore = Number(stockItem.currentStock);
      const restoreQuantity = Number(movement.quantity);
      const stockAfter = stockBefore + restoreQuantity;

      // Create restoration movement
      const restorationMovement = await prisma.stockMovement.create({
        data: {
          ingredientId: movement.ingredientId,
          branchId: movement.branchId,
          type: 'ADJUSTMENT',
          quantity: new Prisma.Decimal(restoreQuantity),
          stockBefore: new Prisma.Decimal(stockBefore),
          stockAfter: new Prisma.Decimal(stockAfter),
          unitCost: movement.unitCost,
          totalCost: movement.totalCost,
          referenceType: 'order_cancellation',
          referenceId: orderId,
          note: `Stock restored for cancelled order #${orderId}`,
        },
      });

      // Update stock item
      await prisma.stockItem.update({
        where: { id: stockItem.id },
        data: {
          currentStock: new Prisma.Decimal(stockAfter),
          theoreticalStock: {
            increment: new Prisma.Decimal(restoreQuantity),
          },
        },
      });

      restoredMovements.push(restorationMovement.id);
    }

    this.logger.log(
      `Stock restored for cancelled order ${orderId}: ${restoredMovements.length} movements`,
    );

    return {
      orderId,
      restoredMovements: restoredMovements.length,
      movementIds: restoredMovements,
    };
  }

  /**
   * Process stock count (inventory count) with auto-adjustment
   * Calculates fire rate: (Fiili Stok - Teorik Stok) / Teorik Stok * 100
   */
  async processStockCount(
    dto: CreateStockCountDto,
    userId: number,
  ): Promise<StockCountSummaryDto> {
    return this.prisma.executeInTransaction(async (tx) => {
      const results: StockCountResultDto[] = [];
      let totalAdjustmentValue = 0;
      let totalFireRate = 0;
      let surplusItems = 0;
      let shortageItems = 0;
      let matchingItems = 0;

      for (const item of dto.items) {
        // Get or create stock item
        let stockItem = await tx.stockItem.findUnique({
          where: {
            ingredientId_branchId: {
              ingredientId: item.ingredientId,
              branchId: dto.branchId,
            },
          },
          include: { ingredient: true },
        });

        if (!stockItem) {
          const ingredient = await tx.ingredient.findUnique({
            where: { id: item.ingredientId },
          });

          if (!ingredient) {
            throw new NotFoundException(
              `Ingredient with ID ${item.ingredientId} not found`,
            );
          }

          stockItem = await tx.stockItem.create({
            data: {
              ingredientId: item.ingredientId,
              branchId: dto.branchId,
              currentStock: 0,
              theoreticalStock: 0,
              minStock: ingredient.minStock,
            },
            include: { ingredient: true },
          });
        }

        const theoreticalStock = Number(stockItem.theoreticalStock);
        const actualStock = item.actualQuantity;
        const difference = actualStock - theoreticalStock;

        // Calculate fire rate: (Fiili - Teorik) / Teorik * 100
        const fireRate = this.calculateFireRate(actualStock, theoreticalStock);

        // Classify difference
        if (difference > 0.001) {
          surplusItems++;
        } else if (difference < -0.001) {
          shortageItems++;
        } else {
          matchingItems++;
        }

        let adjustmentMovementId: number | undefined;

        // Create adjustment movement if there's a difference
        if (Math.abs(difference) > 0.001) {
          const stockBefore = Number(stockItem.currentStock);
          const adjustmentCost =
            Math.abs(difference) * Number(stockItem.ingredient.unitCost);
          totalAdjustmentValue += difference < 0 ? adjustmentCost : -adjustmentCost;

          const movement = await tx.stockMovement.create({
            data: {
              ingredientId: item.ingredientId,
              branchId: dto.branchId,
              type: 'COUNT',
              quantity: new Prisma.Decimal(Math.abs(difference)),
              stockBefore: new Prisma.Decimal(stockBefore),
              stockAfter: new Prisma.Decimal(actualStock),
              unitCost: stockItem.ingredient.unitCost,
              totalCost: new Prisma.Decimal(adjustmentCost),
              referenceType: 'stock_count',
              note: item.note || `Stock count adjustment. Fire rate: ${fireRate.toFixed(2)}%`,
              createdById: userId,
            },
          });

          adjustmentMovementId = movement.id;
        }

        // Update stock item
        await tx.stockItem.update({
          where: { id: stockItem.id },
          data: {
            currentStock: new Prisma.Decimal(actualStock),
            theoreticalStock: new Prisma.Decimal(actualStock), // Reset theoretical after count
            lastCountAt: new Date(),
            lastCountValue: new Prisma.Decimal(actualStock),
          },
        });

        totalFireRate += fireRate;

        results.push({
          ingredientId: item.ingredientId,
          ingredientName: stockItem.ingredient.name,
          unit: stockItem.ingredient.unit,
          theoreticalStock,
          actualStock,
          difference,
          fireRate,
          adjustmentMovementId,
        });

        // Check for critical stock after count
        if (actualStock <= Number(stockItem.minStock)) {
          await this.emitCriticalStockEvent({
            ingredientId: item.ingredientId,
            branchId: dto.branchId,
            currentStock: actualStock,
            minStock: Number(stockItem.minStock),
            ingredientName: stockItem.ingredient.name,
          });
        }
      }

      const summary: StockCountSummaryDto = {
        branchId: dto.branchId,
        countedAt: new Date(),
        countedById: userId,
        totalItems: dto.items.length,
        surplusItems,
        shortageItems,
        matchingItems,
        totalAdjustmentValue: Math.abs(totalAdjustmentValue),
        averageFireRate: dto.items.length > 0 ? totalFireRate / dto.items.length : 0,
        results,
      };

      this.logger.log(
        `Stock count processed for branch ${dto.branchId}: ${dto.items.length} items, avg fire rate: ${summary.averageFireRate.toFixed(2)}%`,
      );

      return summary;
    });
  }

  /**
   * Get stock movements with filters
   */
  async getMovements(query: StockMovementQueryDto) {
    const { page = 1, limit = 20, ingredientId, branchId, type, startDate, endDate } = query;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Prisma.StockMovementWhereInput = {};
    if (ingredientId) where.ingredientId = ingredientId;
    if (branchId) where.branchId = branchId;
    if (type) where.type = type as StockMovementType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        skip,
        take,
        where,
        include: {
          ingredient: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      items: movements,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Get critical stock alerts for a branch
   */
  async getCriticalStockAlerts(branchId?: number): Promise<StockAlert[]> {
    const where: Prisma.StockItemWhereInput = {};
    if (branchId) where.branchId = branchId;

    const stockItems = await this.prisma.stockItem.findMany({
      where,
      include: {
        ingredient: true,
        branch: true,
      },
    });

    const alerts: StockAlert[] = [];

    for (const item of stockItems) {
      const currentStock = Number(item.currentStock);
      const minStock = Number(item.minStock);

      if (currentStock <= minStock) {
        const shortageAmount = minStock - currentStock;
        let severity: 'CRITICAL' | 'WARNING' | 'LOW';

        if (currentStock === 0) {
          severity = 'CRITICAL';
        } else if (currentStock <= minStock * 0.5) {
          severity = 'CRITICAL';
        } else if (currentStock <= minStock * 0.75) {
          severity = 'WARNING';
        } else {
          severity = 'LOW';
        }

        alerts.push({
          id: item.id,
          ingredientId: item.ingredientId,
          ingredientName: item.ingredient.name,
          branchId: item.branchId,
          branchName: item.branch.name,
          currentStock,
          minStock,
          unit: item.ingredient.unit,
          shortageAmount,
          severity,
        });
      }
    }

    // Sort by severity (CRITICAL first, then WARNING, then LOW)
    const severityOrder = { CRITICAL: 0, WARNING: 1, LOW: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
  }

  /**
   * Get waste report for a branch within date range
   */
  async getWasteReport(
    branchId: number,
    startDate: string,
    endDate: string,
  ): Promise<WasteReportDto> {
    const start = new Date(startDate);
    const end = new Date(endDate + 'T23:59:59.999Z');

    // Get all waste movements
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        branchId,
        type: 'WASTE',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        ingredient: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Aggregate by ingredient
    const ingredientMap = new Map<
      number,
      {
        ingredient: typeof movements[0]['ingredient'];
        totalQuantity: number;
        totalCost: number;
        movementCount: number;
      }
    >();

    // Aggregate by date
    const dailyMap = new Map<
      string,
      {
        totalQuantity: number;
        totalCost: number;
        movementCount: number;
      }
    >();

    let totalWasteCost = 0;

    for (const movement of movements) {
      const cost = Number(movement.totalCost || 0);
      totalWasteCost += cost;

      // Aggregate by ingredient
      const existing = ingredientMap.get(movement.ingredientId);
      if (existing) {
        existing.totalQuantity += Number(movement.quantity);
        existing.totalCost += cost;
        existing.movementCount++;
      } else {
        ingredientMap.set(movement.ingredientId, {
          ingredient: movement.ingredient,
          totalQuantity: Number(movement.quantity),
          totalCost: cost,
          movementCount: 1,
        });
      }

      // Aggregate by date
      const dateKey = movement.createdAt.toISOString().split('T')[0];
      const dailyExisting = dailyMap.get(dateKey);
      if (dailyExisting) {
        dailyExisting.totalQuantity += Number(movement.quantity);
        dailyExisting.totalCost += cost;
        dailyExisting.movementCount++;
      } else {
        dailyMap.set(dateKey, {
          totalQuantity: Number(movement.quantity),
          totalCost: cost,
          movementCount: 1,
        });
      }
    }

    // Calculate days in range
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Build items array
    const items: WasteReportItemDto[] = Array.from(ingredientMap.entries()).map(
      ([ingredientId, data]) => ({
        ingredientId,
        ingredientName: data.ingredient.name,
        unit: data.ingredient.unit,
        totalWasteQuantity: data.totalQuantity,
        totalWasteCost: data.totalCost,
        wasteMovements: data.movementCount,
        averageWastePerDay: daysDiff > 0 ? data.totalQuantity / daysDiff : data.totalQuantity,
      }),
    );

    // Sort by total cost descending
    items.sort((a, b) => b.totalWasteCost - a.totalWasteCost);

    // Build daily breakdown
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        totalQuantity: data.totalQuantity,
        totalCost: data.totalCost,
        movementCount: data.movementCount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      branchId,
      startDate,
      endDate,
      totalWasteCost,
      totalWasteMovements: movements.length,
      items,
      dailyBreakdown,
    };
  }

  /**
   * Update stock item
   */
  async update(id: number, data: Partial<{ minStock: number; maxStock: number }>) {
    await this.findOne(id);

    const stockItem = await this.prisma.stockItem.update({
      where: { id },
      data: {
        minStock: data.minStock ? new Prisma.Decimal(data.minStock) : undefined,
        maxStock: data.maxStock ? new Prisma.Decimal(data.maxStock) : undefined,
      },
    });

    this.logger.log(`Stock item updated: ${id}`);
    return stockItem;
  }

  /**
   * Calculate fire rate (deviation percentage)
   * Formula: (Fiili Stok - Teorik Stok) / Teorik Stok * 100
   */
  private calculateFireRate(actualStock: number, theoreticalStock: number): number {
    if (theoreticalStock === 0) {
      return actualStock === 0 ? 0 : 100;
    }
    return ((actualStock - theoreticalStock) / theoreticalStock) * 100;
  }

  /**
   * Emit critical stock event via queue
   */
  private async emitCriticalStockEvent(data: {
    ingredientId: number;
    branchId: number;
    currentStock: number;
    minStock: number;
    ingredientName: string;
  }) {
    const severity = data.currentStock === 0 ? 'OUT_OF_STOCK' : 'CRITICAL';

    await this.stockQueue.add('stock.critical', {
      event: 'stock.critical',
      data: {
        ...data,
        severity,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.warn(
      `Critical stock alert: ${data.ingredientName} at ${data.currentStock} (min: ${data.minStock}) in branch ${data.branchId}`,
    );
  }
}
