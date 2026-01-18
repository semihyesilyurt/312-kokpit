/**
 * Stock Movement DTO
 * Validation for stock movement operations
 */

import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  IsDecimal,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum StockMovementTypeDto {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  WASTE = 'WASTE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  COUNT = 'COUNT',
}

export class CreateStockMovementDto {
  @ApiProperty({
    description: 'Ingredient ID',
    example: 1,
  })
  @IsInt()
  @Min(1)
  ingredientId!: number;

  @ApiProperty({
    description: 'Branch ID',
    example: 1,
  })
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiProperty({
    description: 'Movement type',
    enum: StockMovementTypeDto,
    example: StockMovementTypeDto.PURCHASE,
  })
  @IsEnum(StockMovementTypeDto)
  type!: StockMovementTypeDto;

  @ApiProperty({
    description: 'Quantity (positive value)',
    example: 10.5,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Quantity must be greater than 0' })
  @Type(() => Number)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Unit cost for purchase movements',
    example: 25.50,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Type(() => Number)
  unitCost?: number;

  @ApiPropertyOptional({
    description: 'Reference type (order, transfer, count)',
    example: 'order',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({
    description: 'Reference ID',
    example: 123,
  })
  @IsOptional()
  @IsInt()
  referenceId?: number;

  @ApiPropertyOptional({
    description: 'Note for the movement',
    example: 'Weekly supply delivery',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class StockMovementQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by ingredient ID',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ingredientId?: number;

  @ApiPropertyOptional({
    description: 'Filter by branch ID',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Filter by movement type',
    enum: StockMovementTypeDto,
  })
  @IsOptional()
  @IsEnum(StockMovementTypeDto)
  type?: StockMovementTypeDto;

  @ApiPropertyOptional({
    description: 'Start date for filtering',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering',
    example: '2025-01-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class BulkStockMovementDto {
  @ApiProperty({
    description: 'Array of stock movements',
    type: [CreateStockMovementDto],
  })
  movements!: CreateStockMovementDto[];
}
