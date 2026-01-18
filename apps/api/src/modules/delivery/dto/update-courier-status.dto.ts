/**
 * Update Courier Status DTO
 * Validation for courier status update requests
 */

import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Map frontend courier status names to backend enum values
 */
const COURIER_STATUS_MAP: Record<string, string> = {
  busy: 'ON_DELIVERY',
  delivering: 'ON_DELIVERY',
  on_delivery: 'ON_DELIVERY',
  break: 'ON_BREAK',
  on_break: 'ON_BREAK',
};

/**
 * Normalize courier status: lowercase → UPPERCASE with alias mapping
 */
function normalizeCourierStatus(value: string): string {
  const upper = value.toUpperCase();
  return COURIER_STATUS_MAP[value.toLowerCase()] || upper;
}

export enum CourierStatusEnum {
  AVAILABLE = 'AVAILABLE',
  ON_DELIVERY = 'ON_DELIVERY',
  RETURNING = 'RETURNING',
  OFFLINE = 'OFFLINE',
  ON_BREAK = 'ON_BREAK',
}

export class UpdateCourierStatusDto {
  @ApiProperty({
    description: 'New courier status',
    enum: CourierStatusEnum,
    example: CourierStatusEnum.AVAILABLE,
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeCourierStatus(value) : value))
  @IsEnum(CourierStatusEnum, {
    message: 'Status must be one of: AVAILABLE, ON_DELIVERY, RETURNING, OFFLINE, ON_BREAK',
  })
  status!: CourierStatusEnum;

  @ApiPropertyOptional({
    description: 'Optional reason for status change',
    example: 'Starting shift',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
