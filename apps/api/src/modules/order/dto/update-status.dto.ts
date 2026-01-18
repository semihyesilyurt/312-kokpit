/**
 * Update Order Status DTO
 * Validation for order status update requests
 */

import { IsString, IsEnum, IsOptional, MaxLength, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

/**
 * Map frontend status names to backend enum values
 */
const STATUS_MAP: Record<string, string> = {
  delivering: 'ON_DELIVERY',
  on_delivery: 'ON_DELIVERY',
  completed: 'DELIVERED',
  done: 'DELIVERED',
};

/**
 * Normalize status value: lowercase → UPPERCASE with alias mapping
 */
function normalizeStatus(value: string): string {
  const upper = value.toUpperCase();
  return STATUS_MAP[value.toLowerCase()] || upper;
}

/**
 * Order status enum matching Prisma schema
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  ON_DELIVERY = 'ON_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/**
 * Valid status transitions map
 * Defines which status transitions are allowed from each status
 */
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.ON_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.ON_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
): boolean {
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions?.includes(newStatus) ?? false;
}

/**
 * Get allowed next statuses for a given status
 */
export function getAllowedNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Update Order Status DTO
 */
export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    enum: OrderStatus,
    example: OrderStatus.CONFIRMED,
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeStatus(value) : value))
  @IsEnum(OrderStatus, { message: 'Invalid order status' })
  status!: OrderStatus;

  @ApiPropertyOptional({
    description: 'Note or reason for status change',
    example: 'Customer requested delay',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Cancel Order DTO
 */
export class CancelOrderDto {
  @ApiPropertyOptional({
    description: 'Reason for cancellation',
    example: 'Customer requested cancellation',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Assign Courier DTO
 */
export class AssignCourierDto {
  @ApiProperty({
    description: 'Courier ID to assign',
    example: 1,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  courierId!: number;

  @ApiPropertyOptional({
    description: 'Note for courier assignment',
    example: 'Priority delivery',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
