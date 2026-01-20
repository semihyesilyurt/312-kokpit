/**
 * Order Query DTO
 * Validation for order list filtering and pagination
 */

import {
  IsOptional,
  IsEnum,
  IsInt,
  IsString,
  IsDateString,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { OrderStatus } from './update-status.dto';
import { Platform, PaymentMethod } from './create-order.dto';

/**
 * Payment status enum
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

/**
 * Sort field options for orders
 */
export enum OrderSortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  TOTAL_AMOUNT = 'totalAmount',
  ORDER_NUMBER = 'orderNumber',
}

/**
 * Sort order options
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Map frontend status names to backend enum values
 */
const STATUS_MAP: Record<string, string> = {
  delivering: 'ON_DELIVERY',
  on_delivery: 'ON_DELIVERY',
};

function normalizeStatus(value: string): string {
  const upper = value.toUpperCase();
  return STATUS_MAP[value.toLowerCase()] || upper;
}

/**
 * Normalize enum value: lowercase → UPPERCASE
 */
function normalizeEnumValue(value: string): string {
  return value.toUpperCase();
}

/**
 * Order Query DTO for filtering and pagination
 */
export class OrderQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by order status',
    enum: OrderStatus,
    example: OrderStatus.PENDING,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeStatus(value) : value))
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Filter by multiple order statuses',
    type: [String],
    enum: OrderStatus,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    // Handle comma-separated string: "confirmed,preparing,ready"
    if (typeof value === 'string') {
      return value.split(',').map((v) => normalizeStatus(v.trim()));
    }
    // Handle array: ["confirmed", "preparing", "ready"]
    if (Array.isArray(value)) {
      return value.map((v: string) => (typeof v === 'string' ? normalizeStatus(v) : v));
    }
    return [normalizeStatus(String(value))];
  })
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];

  @ApiPropertyOptional({
    description: 'Filter by platform',
    enum: Platform,
    example: Platform.GETIR,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEnumValue(value) : value))
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({
    description: 'Filter by multiple platforms',
    type: [String],
    enum: Platform,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Platform, { each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((v: string) => (typeof v === 'string' ? normalizeEnumValue(v) : v));
  })
  platforms?: Platform[];

  @ApiPropertyOptional({
    description: 'Filter by payment method',
    enum: PaymentMethod,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEnumValue(value) : value))
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: PaymentStatus,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEnumValue(value) : value))
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Filter by branch ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({
    description: 'Filter by courier ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courierId?: number;

  @ApiPropertyOptional({
    description: 'Search by order number, customer name, or phone',
    example: 'ORD-2026',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter orders created after this date (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter orders created before this date (ISO 8601)',
    example: '2026-01-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Minimum order total amount',
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({
    description: 'Maximum order total amount',
    example: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: OrderSortField,
    default: OrderSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(OrderSortField)
  sortBy?: OrderSortField = OrderSortField.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}

/**
 * Active Orders Query DTO
 * For fetching orders that are currently being processed
 */
export class ActiveOrdersQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by branch ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Filter by platform',
    enum: Platform,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEnumValue(value) : value))
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: OrderSortField,
    default: OrderSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(OrderSortField)
  sortBy?: OrderSortField = OrderSortField.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.ASC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;
}

/**
 * Order Stats Query DTO
 * For fetching order statistics
 */
export class OrderStatsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by branch ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Start date for statistics period (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for statistics period (ISO 8601)',
    example: '2026-01-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by platform',
    enum: Platform,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEnumValue(value) : value))
  @IsEnum(Platform)
  platform?: Platform;
}
