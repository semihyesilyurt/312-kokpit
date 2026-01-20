/**
 * Rule Engine Service
 * Business rules evaluation and automated action execution
 *
 * Features:
 * - Metric collection (couriers, delivery time, orders, stock, waste)
 * - Condition evaluation with multiple operators
 * - Automated action execution (platform control, notifications, etc.)
 * - Cooldown support to prevent action spam
 * - Rollback capability for reversible actions
 * - Cron-based periodic evaluation
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma, RuleStatus, RuleActionType } from '@prisma/client';
import {
  CreateRuleDto,
  UpdateRuleDto,
  RuleQueryDto,
  TestRuleDto,
  ExecutionQueryDto,
  RuleMetric,
  ConditionOperator,
  RuleAction,
  RuleStatusEnum,
} from './dto/rule.dto';

export interface MetricValues {
  available_couriers: number;
  average_delivery_time: number;
  active_orders: number;
  pending_orders: number;
  late_deliveries: number;
  order_rate_per_hour: number;
  stock_levels: Record<number, number>;
  waste_rate: number;
}

interface RollbackData {
  actionType: RuleActionType;
  previousState: Record<string, unknown>;
  executedAt: Date;
}

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all rules with filtering
   */
  async findAll(queryDto: RuleQueryDto) {
    const { status, actionType } = queryDto;

    const where: Prisma.RuleWhereInput = {};
    if (status) where.status = status as RuleStatus;
    if (actionType) where.actionType = actionType as RuleActionType;

    const rules = await this.prisma.rule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { executions: true },
        },
      },
    });

    return {
      items: rules,
      total: rules.length,
    };
  }

  /**
   * Get single rule by ID
   */
  async findOne(id: number) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      include: {
        executions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Rule with ID ${id} not found`);
    }

    return rule;
  }

  /**
   * Create a new rule
   */
  async create(createRuleDto: CreateRuleDto, userId?: number) {
    const rule = await this.prisma.rule.create({
      data: {
        name: createRuleDto.name,
        description: createRuleDto.description,
        condition: createRuleDto.condition as unknown as Prisma.JsonObject,
        actionType: createRuleDto.actionType as RuleActionType,
        actionParams: createRuleDto.actionParams as unknown as Prisma.JsonObject,
        priority: createRuleDto.priority ?? 0,
        cooldownMinutes: createRuleDto.cooldownMinutes ?? 5,
        status: (createRuleDto.status ?? RuleStatusEnum.DRAFT) as RuleStatus,
        createdById: userId,
      },
    });

    this.logger.log(`Rule created: ${rule.name} (ID: ${rule.id})`);
    return rule;
  }

  /**
   * Update an existing rule
   */
  async update(id: number, updateRuleDto: UpdateRuleDto) {
    await this.findOne(id);

    const updateData: Prisma.RuleUpdateInput = {};

    if (updateRuleDto.name !== undefined) updateData.name = updateRuleDto.name;
    if (updateRuleDto.description !== undefined) updateData.description = updateRuleDto.description;
    if (updateRuleDto.condition !== undefined) {
      updateData.condition = updateRuleDto.condition as unknown as Prisma.JsonObject;
    }
    if (updateRuleDto.actionType !== undefined) {
      updateData.actionType = updateRuleDto.actionType as RuleActionType;
    }
    if (updateRuleDto.actionParams !== undefined) {
      updateData.actionParams = updateRuleDto.actionParams as unknown as Prisma.JsonObject;
    }
    if (updateRuleDto.priority !== undefined) updateData.priority = updateRuleDto.priority;
    if (updateRuleDto.cooldownMinutes !== undefined) {
      updateData.cooldownMinutes = updateRuleDto.cooldownMinutes;
    }
    if (updateRuleDto.status !== undefined) {
      updateData.status = updateRuleDto.status as RuleStatus;
    }

    const rule = await this.prisma.rule.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Rule updated: ${rule.name} (ID: ${id})`);
    return rule;
  }

  /**
   * Delete a rule (soft delete by setting to INACTIVE)
   */
  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.rule.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    this.logger.log(`Rule deleted: ${id}`);
    return { message: 'Rule deleted successfully' };
  }

  /**
   * Toggle rule active status
   */
  async toggle(id: number) {
    const rule = await this.findOne(id);

    const newStatus = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const updated = await this.prisma.rule.update({
      where: { id },
      data: { status: newStatus },
    });

    this.logger.log(`Rule ${id} toggled to ${newStatus}`);
    return updated;
  }

  /**
   * Get rule execution history
   */
  async getExecutions(id: number, queryDto: ExecutionQueryDto) {
    await this.findOne(id);

    const { page = 1, limit = 20, triggered } = queryDto;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Prisma.RuleExecutionWhereInput = { ruleId: id };
    if (triggered !== undefined) where.triggered = triggered;

    const [executions, total] = await Promise.all([
      this.prisma.ruleExecution.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ruleExecution.count({ where }),
    ]);

    return {
      items: executions,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  /**
   * Test a rule without executing actions
   */
  async testRule(id: number, testDto: TestRuleDto) {
    const rule = await this.findOne(id);

    // Collect current metrics
    const metrics = await this.collectMetrics(testDto.branchId);

    // Apply overrides for testing
    if (testDto.metricOverrides) {
      Object.entries(testDto.metricOverrides).forEach(([key, value]) => {
        if (key in metrics) {
          (metrics as any)[key] = value;
        }
      });
    }

    // Evaluate condition
    const condition = rule.condition as unknown as {
      metric: RuleMetric;
      operator: ConditionOperator;
      value: number | number[];
      ingredientId?: number;
    };

    const metricValue = this.getMetricValue(metrics, condition.metric, condition.ingredientId);
    const conditionMet = this.evaluateCondition(
      metricValue,
      condition.operator,
      condition.value,
    );

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        condition: rule.condition,
        actionType: rule.actionType,
      },
      testResult: {
        conditionMet,
        metricValue,
        expectedValue: condition.value,
        operator: condition.operator,
        allMetrics: metrics,
      },
      wouldExecute: conditionMet && rule.status === 'ACTIVE',
      note: conditionMet
        ? `Action "${rule.actionType}" would be executed`
        : 'Condition not met, no action would be taken',
    };
  }

  /**
   * Rollback a rule execution
   */
  async rollback(id: number, executionId: number) {
    const rule = await this.findOne(id);

    const execution = await this.prisma.ruleExecution.findFirst({
      where: { id: executionId, ruleId: id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found for rule ${id}`);
    }

    if (!execution.canRollback) {
      throw new BadRequestException('This execution cannot be rolled back');
    }

    if (execution.rolledBackAt) {
      throw new BadRequestException('This execution has already been rolled back');
    }

    // Execute rollback based on action type
    const rollbackData = execution.rollbackData as unknown as RollbackData;
    await this.executeRollback(rule.actionType, rollbackData);

    // Update execution record
    await this.prisma.ruleExecution.update({
      where: { id: executionId },
      data: { rolledBackAt: new Date() },
    });

    this.logger.log(`Execution ${executionId} rolled back for rule ${id}`);

    return {
      message: 'Rollback executed successfully',
      executionId,
      rolledBackAt: new Date(),
    };
  }

  /**
   * Cron job: Evaluate all active rules every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateAllRules() {
    this.logger.debug('Starting rule evaluation cycle');

    const activeRules = await this.prisma.rule.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { priority: 'desc' },
    });

    if (activeRules.length === 0) {
      this.logger.debug('No active rules to evaluate');
      return;
    }

    // Get all branches for evaluation
    const branches = await this.prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const rule of activeRules) {
      try {
        // Check cooldown
        if (rule.lastTriggeredAt) {
          const cooldownEnd = new Date(
            rule.lastTriggeredAt.getTime() + rule.cooldownMinutes * 60 * 1000,
          );
          if (new Date() < cooldownEnd) {
            this.logger.debug(`Rule ${rule.id} in cooldown, skipping`);
            continue;
          }
        }

        // Determine if rule is branch-specific
        const condition = rule.condition as unknown as {
          metric: RuleMetric;
          operator: ConditionOperator;
          value: number | number[];
          branchId?: number;
          ingredientId?: number;
        };

        const branchesToCheck = condition.branchId
          ? [{ id: condition.branchId }]
          : branches;

        for (const branch of branchesToCheck) {
          await this.evaluateRuleForBranch(rule, branch.id);
        }
      } catch (error) {
        this.logger.error(`Error evaluating rule ${rule.id}: ${error}`);
      }
    }

    this.logger.debug('Rule evaluation cycle completed');
  }

  /**
   * Evaluate a single rule for a specific branch
   */
  private async evaluateRuleForBranch(
    rule: any,
    branchId: number,
  ) {
    const startTime = Date.now();

    // Collect metrics for this branch
    const metrics = await this.collectMetrics(branchId);

    // Parse condition
    const condition = rule.condition as unknown as {
      metric: RuleMetric;
      operator: ConditionOperator;
      value: number | number[];
      ingredientId?: number;
    };

    // Get metric value
    const metricValue = this.getMetricValue(metrics, condition.metric, condition.ingredientId);

    // Evaluate condition
    const conditionMet = this.evaluateCondition(
      metricValue,
      condition.operator,
      condition.value,
    );

    // Create execution record
    const execution = await this.prisma.ruleExecution.create({
      data: {
        ruleId: rule.id,
        triggered: conditionMet,
        conditionValue: {
          metric: condition.metric,
          actualValue: metricValue,
          expectedValue: condition.value,
          branchId,
        },
        executionTime: Date.now() - startTime,
      },
    });

    if (conditionMet) {
      this.logger.log(`Rule ${rule.id} triggered for branch ${branchId}`);

      try {
        // Execute action
        const actionResult = await this.executeAction(
          rule.actionType,
          rule.actionParams as Record<string, unknown>,
          branchId,
        );

        // Update execution with result
        await this.prisma.ruleExecution.update({
          where: { id: execution.id },
          data: {
            actionTaken: JSON.stringify(actionResult.action),
            result: 'success',
            canRollback: actionResult.canRollback,
            rollbackData: actionResult.rollbackData as unknown as Prisma.JsonObject,
          },
        });

        // Update rule trigger info
        await this.prisma.rule.update({
          where: { id: rule.id },
          data: {
            lastTriggeredAt: new Date(),
            triggerCount: { increment: 1 },
          },
        });
      } catch (error) {
        // Update execution with error
        await this.prisma.ruleExecution.update({
          where: { id: execution.id },
          data: {
            result: 'failed',
            errorMessage: String(error),
          },
        });

        this.logger.error(`Failed to execute action for rule ${rule.id}: ${error}`);
      }
    }
  }

  /**
   * Collect all metrics for evaluation
   */
  private async collectMetrics(branchId?: number): Promise<MetricValues> {
    const branchWhere = branchId ? { branchId } : {};

    const [
      availableCouriers,
      avgDeliveryTime,
      activeOrders,
      pendingOrders,
      lateDeliveries,
      hourlyOrders,
      stockItems,
      wasteData,
    ] = await Promise.all([
      // Available couriers
      this.prisma.courier.count({
        where: {
          ...branchWhere,
          status: 'AVAILABLE',
          isOnShift: true,
        },
      }),

      // Average delivery time (last hour)
      this.prisma.order.aggregate({
        where: {
          ...branchWhere,
          status: 'DELIVERED',
          deliveredAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          deliveryDuration: { not: null },
        },
        _avg: { deliveryDuration: true },
      }),

      // Active orders
      this.prisma.order.count({
        where: {
          ...branchWhere,
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_DELIVERY'] },
        },
      }),

      // Pending orders (not yet confirmed)
      this.prisma.order.count({
        where: {
          ...branchWhere,
          status: 'PENDING',
        },
      }),

      // Late deliveries (today)
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM orders
        WHERE status = 'DELIVERED'
        AND actualDelivery > estimatedDelivery
        AND DATE(deliveredAt) = CURDATE()
        ${branchId ? Prisma.sql`AND branchId = ${branchId}` : Prisma.empty}
      `,

      // Orders in last hour
      this.prisma.order.count({
        where: {
          ...branchWhere,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      }),

      // Stock levels
      this.prisma.stockItem.findMany({
        where: branchWhere,
        select: {
          ingredientId: true,
          currentStock: true,
          minStock: true,
        },
      }),

      // Waste rate calculation
      this.prisma.stockItem.aggregate({
        where: branchWhere,
        _sum: { currentStock: true, theoreticalStock: true },
      }),
    ]);

    // Build stock levels map
    const stockLevels: Record<number, number> = {};
    for (const item of stockItems) {
      stockLevels[item.ingredientId] = Number(item.currentStock);
    }

    // Calculate waste rate
    const currentStock = Number(wasteData._sum.currentStock || 0);
    const theoreticalStock = Number(wasteData._sum.theoreticalStock || 1);
    const wasteRate = theoreticalStock > 0
      ? ((theoreticalStock - currentStock) / theoreticalStock) * 100
      : 0;

    return {
      available_couriers: availableCouriers,
      average_delivery_time: avgDeliveryTime._avg.deliveryDuration || 0,
      active_orders: activeOrders,
      pending_orders: pendingOrders,
      late_deliveries: Number(lateDeliveries[0]?.count || 0),
      order_rate_per_hour: hourlyOrders,
      stock_levels: stockLevels,
      waste_rate: wasteRate,
    };
  }

  /**
   * Get specific metric value
   */
  private getMetricValue(
    metrics: MetricValues,
    metric: RuleMetric,
    ingredientId?: number,
  ): number {
    switch (metric) {
      case RuleMetric.AVAILABLE_COURIERS:
        return metrics.available_couriers;
      case RuleMetric.AVERAGE_DELIVERY_TIME:
        return metrics.average_delivery_time;
      case RuleMetric.ACTIVE_ORDERS:
        return metrics.active_orders;
      case RuleMetric.PENDING_ORDERS:
        return metrics.pending_orders;
      case RuleMetric.LATE_DELIVERIES:
        return metrics.late_deliveries;
      case RuleMetric.ORDER_RATE_PER_HOUR:
        return metrics.order_rate_per_hour;
      case RuleMetric.WASTE_RATE:
        return metrics.waste_rate;
      case RuleMetric.STOCK_LEVEL:
        if (ingredientId && metrics.stock_levels[ingredientId] !== undefined) {
          return metrics.stock_levels[ingredientId];
        }
        return -1; // Invalid/not found
      default:
        return -1;
    }
  }

  /**
   * Evaluate condition with given operator
   */
  private evaluateCondition(
    actual: number,
    operator: ConditionOperator,
    expected: number | number[],
  ): boolean {
    switch (operator) {
      case ConditionOperator.EQ:
        return actual === expected;
      case ConditionOperator.NEQ:
        return actual !== expected;
      case ConditionOperator.GT:
        return actual > (expected as number);
      case ConditionOperator.GTE:
        return actual >= (expected as number);
      case ConditionOperator.LT:
        return actual < (expected as number);
      case ConditionOperator.LTE:
        return actual <= (expected as number);
      case ConditionOperator.BETWEEN:
        if (Array.isArray(expected) && expected.length === 2) {
          return actual >= expected[0] && actual <= expected[1];
        }
        return false;
      case ConditionOperator.IN:
        if (Array.isArray(expected)) {
          return expected.includes(actual);
        }
        return false;
      case ConditionOperator.NOT_IN:
        if (Array.isArray(expected)) {
          return !expected.includes(actual);
        }
        return true;
      default:
        return false;
    }
  }

  /**
   * Execute rule action
   */
  private async executeAction(
    actionType: RuleActionType,
    params: Record<string, unknown>,
    branchId: number,
  ): Promise<{
    action: Record<string, unknown>;
    canRollback: boolean;
    rollbackData?: RollbackData;
  }> {
    switch (actionType) {
      case 'CLOSE_PLATFORM':
        return this.closePlatform(params.platform as string, branchId);

      case 'OPEN_PLATFORM':
        return this.openPlatform(params.platform as string, branchId);

      case 'DISABLE_PRODUCT':
        return this.disableProduct(params.productId as number);

      case 'ENABLE_PRODUCT':
        return this.enableProduct(params.productId as number);

      case 'SEND_NOTIFICATION':
        return this.sendNotification(params, branchId);

      case 'HOLD_ORDERS':
        return this.holdOrders(branchId);

      default:
        this.logger.warn(`Unknown action type: ${actionType}`);
        return {
          action: { type: actionType, status: 'not_implemented' },
          canRollback: false,
        };
    }
  }

  /**
   * Close a platform
   */
  private async closePlatform(platform: string, branchId: number) {
    // Get current state
    const config = await this.prisma.platformConfig.findFirst({
      where: { platform: platform as any },
    });

    const previousState = { isActive: config?.isActive ?? true };

    // Update platform config (this is simplified - in production you'd call platform API)
    if (config) {
      await this.prisma.platformConfig.update({
        where: { id: config.id },
        data: { isActive: false },
      });
    }

    this.logger.log(`Platform ${platform} closed for branch ${branchId}`);

    return {
      action: { type: 'CLOSE_PLATFORM', platform, branchId },
      canRollback: true,
      rollbackData: {
        actionType: 'CLOSE_PLATFORM' as RuleActionType,
        previousState,
        executedAt: new Date(),
      },
    };
  }

  /**
   * Open a platform
   */
  private async openPlatform(platform: string, branchId: number) {
    const config = await this.prisma.platformConfig.findFirst({
      where: { platform: platform as any },
    });

    const previousState = { isActive: config?.isActive ?? false };

    if (config) {
      await this.prisma.platformConfig.update({
        where: { id: config.id },
        data: { isActive: true },
      });
    }

    this.logger.log(`Platform ${platform} opened for branch ${branchId}`);

    return {
      action: { type: 'OPEN_PLATFORM', platform, branchId },
      canRollback: true,
      rollbackData: {
        actionType: 'OPEN_PLATFORM' as RuleActionType,
        previousState,
        executedAt: new Date(),
      },
    };
  }

  /**
   * Disable a product
   */
  private async disableProduct(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const previousState = { isAvailable: product.isAvailable };

    await this.prisma.product.update({
      where: { id: productId },
      data: { isAvailable: false },
    });

    this.logger.log(`Product ${productId} disabled`);

    return {
      action: { type: 'DISABLE_PRODUCT', productId },
      canRollback: true,
      rollbackData: {
        actionType: 'DISABLE_PRODUCT' as RuleActionType,
        previousState: { ...previousState, productId },
        executedAt: new Date(),
      },
    };
  }

  /**
   * Enable a product
   */
  private async enableProduct(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const previousState = { isAvailable: product.isAvailable };

    await this.prisma.product.update({
      where: { id: productId },
      data: { isAvailable: true },
    });

    this.logger.log(`Product ${productId} enabled`);

    return {
      action: { type: 'ENABLE_PRODUCT', productId },
      canRollback: true,
      rollbackData: {
        actionType: 'ENABLE_PRODUCT' as RuleActionType,
        previousState: { ...previousState, productId },
        executedAt: new Date(),
      },
    };
  }

  /**
   * Send notification
   */
  private async sendNotification(
    params: Record<string, unknown>,
    branchId: number,
  ) {
    const recipients = params.notifyRecipients as string[] || ['ADMIN'];
    const message = params.notificationMessage as string || 'Rule triggered';

    // Create notifications for recipients
    // In production, this would integrate with NotificationService
    for (const recipient of recipients) {
      await this.prisma.notification.create({
        data: {
          type: 'SYSTEM_ALERT',
          channel: 'IN_APP',
          title: 'Rule Alert',
          body: message.replace('{{branch}}', `Branch ${branchId}`),
          status: 'pending',
          priority: 1,
        },
      });
    }

    this.logger.log(`Notification sent to ${recipients.length} recipients`);

    return {
      action: { type: 'SEND_NOTIFICATION', recipients, branchId },
      canRollback: false,
    };
  }

  /**
   * Hold orders (mark as requiring manual confirmation)
   */
  private async holdOrders(branchId: number) {
    // This would typically set a flag or change order processing behavior
    // For now, we'll create a setting record
    await this.prisma.setting.upsert({
      where: { key: `orders_on_hold_${branchId}` },
      create: {
        key: `orders_on_hold_${branchId}`,
        value: true,
        type: 'boolean',
        category: 'orders',
        description: 'Orders are on hold for this branch',
      },
      update: {
        value: true,
      },
    });

    this.logger.log(`Orders held for branch ${branchId}`);

    return {
      action: { type: 'HOLD_ORDERS', branchId },
      canRollback: true,
      rollbackData: {
        actionType: 'HOLD_ORDERS' as RuleActionType,
        previousState: { branchId, holdStatus: false },
        executedAt: new Date(),
      },
    };
  }

  /**
   * Execute rollback for an action
   */
  private async executeRollback(
    actionType: RuleActionType,
    rollbackData: RollbackData,
  ) {
    const { previousState } = rollbackData;

    switch (actionType) {
      case 'CLOSE_PLATFORM':
        if (previousState.isActive) {
          // Reopen platform
          const platform = previousState.platform as string;
          const config = await this.prisma.platformConfig.findFirst({
            where: { platform: platform as any },
          });
          if (config) {
            await this.prisma.platformConfig.update({
              where: { id: config.id },
              data: { isActive: true },
            });
          }
        }
        break;

      case 'OPEN_PLATFORM':
        if (!previousState.isActive) {
          const platform = previousState.platform as string;
          const config = await this.prisma.platformConfig.findFirst({
            where: { platform: platform as any },
          });
          if (config) {
            await this.prisma.platformConfig.update({
              where: { id: config.id },
              data: { isActive: false },
            });
          }
        }
        break;

      case 'DISABLE_PRODUCT':
        if (previousState.isAvailable && previousState.productId) {
          await this.prisma.product.update({
            where: { id: previousState.productId as number },
            data: { isAvailable: true },
          });
        }
        break;

      case 'ENABLE_PRODUCT':
        if (!previousState.isAvailable && previousState.productId) {
          await this.prisma.product.update({
            where: { id: previousState.productId as number },
            data: { isAvailable: false },
          });
        }
        break;

      case 'HOLD_ORDERS':
        if (previousState.branchId) {
          await this.prisma.setting.update({
            where: { key: `orders_on_hold_${previousState.branchId}` },
            data: { value: false },
          });
        }
        break;

      default:
        this.logger.warn(`Rollback not supported for action: ${actionType}`);
    }
  }
}
