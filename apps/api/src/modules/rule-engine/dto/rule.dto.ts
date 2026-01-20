/**
 * Rule Engine DTOs
 * Validation for rule management endpoints
 */

import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Available metrics for rule conditions
 */
export enum RuleMetric {
  AVAILABLE_COURIERS = 'available_couriers',
  AVERAGE_DELIVERY_TIME = 'average_delivery_time',
  ACTIVE_ORDERS = 'active_orders',
  STOCK_LEVEL = 'stock_level',
  WASTE_RATE = 'waste_rate',
  PENDING_ORDERS = 'pending_orders',
  LATE_DELIVERIES = 'late_deliveries',
  ORDER_RATE_PER_HOUR = 'order_rate_per_hour',
}

/**
 * Comparison operators for conditions
 */
export enum ConditionOperator {
  EQ = 'eq',
  NEQ = 'neq',
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  BETWEEN = 'between',
  IN = 'in',
  NOT_IN = 'not_in',
}

/**
 * Available actions for rules
 */
export enum RuleAction {
  CLOSE_PLATFORM = 'CLOSE_PLATFORM',
  OPEN_PLATFORM = 'OPEN_PLATFORM',
  DISABLE_PRODUCT = 'DISABLE_PRODUCT',
  ENABLE_PRODUCT = 'ENABLE_PRODUCT',
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  HOLD_ORDERS = 'HOLD_ORDERS',
  RELEASE_ORDERS = 'RELEASE_ORDERS',
  ADJUST_PRICE = 'ADJUST_PRICE',
}

/**
 * Rule status enum
 */
export enum RuleStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DRAFT = 'DRAFT',
}

/**
 * Condition DTO for rule conditions
 */
export class RuleConditionDto {
  @ApiProperty({
    description: 'Metric to evaluate',
    enum: RuleMetric,
    example: RuleMetric.AVAILABLE_COURIERS,
  })
  @IsEnum(RuleMetric)
  metric!: RuleMetric;

  @ApiProperty({
    description: 'Comparison operator',
    enum: ConditionOperator,
    example: ConditionOperator.LT,
  })
  @IsEnum(ConditionOperator)
  operator!: ConditionOperator;

  @ApiProperty({
    description: 'Value to compare against',
    example: 2,
  })
  @IsNotEmpty()
  value!: number | number[] | string | string[];

  @ApiPropertyOptional({
    description: 'Branch ID for branch-specific condition',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Ingredient ID for stock-related conditions',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  ingredientId?: number;
}

/**
 * Action parameters DTO
 */
export class RuleActionParamsDto {
  @ApiPropertyOptional({
    description: 'Platform to affect (GETIR, YEMEKSEPETI, etc.)',
    example: 'GETIR',
  })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({
    description: 'Product ID to affect',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  productId?: number;

  @ApiPropertyOptional({
    description: 'Duration in minutes for temporary actions',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Notification recipients (user IDs or role names)',
    example: ['ADMIN', 'BRANCH_MANAGER'],
  })
  @IsOptional()
  @IsArray()
  notifyRecipients?: string[];

  @ApiPropertyOptional({
    description: 'Notification message template',
    example: 'Alert: Low courier availability at {{branch}}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notificationMessage?: string;

  @ApiPropertyOptional({
    description: 'Price adjustment percentage',
    example: -10,
  })
  @IsOptional()
  @IsInt()
  priceAdjustmentPercent?: number;
}

/**
 * Create Rule DTO
 */
export class CreateRuleDto {
  @ApiProperty({
    description: 'Rule name',
    example: 'Low Courier Availability Alert',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Rule description',
    example: 'Closes platform when fewer than 2 couriers are available',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Rule condition',
    type: RuleConditionDto,
  })
  @ValidateNested()
  @Type(() => RuleConditionDto)
  condition!: RuleConditionDto;

  @ApiProperty({
    description: 'Action to execute when condition is met',
    enum: RuleAction,
    example: RuleAction.CLOSE_PLATFORM,
  })
  @IsEnum(RuleAction)
  actionType!: RuleAction;

  @ApiPropertyOptional({
    description: 'Action parameters',
    type: RuleActionParamsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RuleActionParamsDto)
  actionParams?: RuleActionParamsDto;

  @ApiPropertyOptional({
    description: 'Rule priority (higher = evaluated first)',
    example: 10,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Cooldown in minutes between rule executions',
    example: 15,
    default: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  cooldownMinutes?: number;

  @ApiPropertyOptional({
    description: 'Rule status',
    enum: RuleStatusEnum,
    default: RuleStatusEnum.DRAFT,
  })
  @IsOptional()
  @IsEnum(RuleStatusEnum)
  status?: RuleStatusEnum;
}

/**
 * Update Rule DTO
 */
export class UpdateRuleDto extends PartialType(CreateRuleDto) {}

/**
 * Rule Query DTO
 */
export class RuleQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: RuleStatusEnum,
  })
  @IsOptional()
  @IsEnum(RuleStatusEnum)
  status?: RuleStatusEnum;

  @ApiPropertyOptional({
    description: 'Filter by action type',
    enum: RuleAction,
  })
  @IsOptional()
  @IsEnum(RuleAction)
  actionType?: RuleAction;
}

/**
 * Test Rule DTO
 */
export class TestRuleDto {
  @ApiPropertyOptional({
    description: 'Branch ID to test against',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Override metric values for testing',
    example: { available_couriers: 1, active_orders: 10 },
  })
  @IsOptional()
  @IsObject()
  metricOverrides?: Record<string, number>;
}

/**
 * Execution Query DTO
 */
export class ExecutionQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by triggered status',
  })
  @IsOptional()
  @IsBoolean()
  triggered?: boolean;
}
