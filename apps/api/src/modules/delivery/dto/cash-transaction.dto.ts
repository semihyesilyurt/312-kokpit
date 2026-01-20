/**
 * Cash Transaction DTO
 * Validation for courier cash transaction requests
 */

import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CashTransactionType {
  COLLECTION = 'collection',
  HANDOVER = 'handover',
  ADVANCE = 'advance',
  ADJUSTMENT = 'adjustment',
}

export class CashTransactionDto {
  @ApiProperty({
    description: 'Type of cash transaction',
    enum: CashTransactionType,
    example: CashTransactionType.HANDOVER,
  })
  @IsEnum(CashTransactionType, {
    message: 'Type must be one of: collection, handover, advance, adjustment',
  })
  type!: CashTransactionType;

  @ApiProperty({
    description: 'Transaction amount (positive value)',
    example: 150.0,
    minimum: 0.01,
  })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount!: number;

  @ApiPropertyOptional({
    description: 'Associated order ID (for collection type)',
    example: 123,
  })
  @IsOptional()
  @IsNumber()
  orderId?: number;

  @ApiPropertyOptional({
    description: 'Optional note for the transaction',
    example: 'End of shift cash handover',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AutoAssignDto {
  @ApiProperty({
    description: 'Order ID to assign a courier to',
    example: 123,
  })
  @IsNumber()
  orderId!: number;

  @ApiPropertyOptional({
    description: 'Branch ID to search for available couriers',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Minimum score threshold for courier assignment (default: 30)',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minScore?: number;
}
