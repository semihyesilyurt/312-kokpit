/**
 * Stock Count DTO
 * Validation for stock counting (inventory) operations
 */

import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class StockCountItemDto {
  @ApiProperty({
    description: 'Ingredient ID',
    example: 1,
  })
  @IsInt()
  @Min(1)
  ingredientId!: number;

  @ApiProperty({
    description: 'Actual counted quantity (Fiili Stok)',
    example: 45.5,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  actualQuantity!: number;

  @ApiPropertyOptional({
    description: 'Note for this specific item',
    example: 'Some items were damaged',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateStockCountDto {
  @ApiProperty({
    description: 'Branch ID for the stock count',
    example: 1,
  })
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiProperty({
    description: 'Array of counted stock items',
    type: [StockCountItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockCountItemDto)
  items!: StockCountItemDto[];

  @ApiPropertyOptional({
    description: 'General note for the stock count',
    example: 'Weekly inventory count',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class StockCountResultDto {
  @ApiProperty({
    description: 'Ingredient ID',
  })
  ingredientId!: number;

  @ApiProperty({
    description: 'Ingredient name',
  })
  ingredientName!: string;

  @ApiProperty({
    description: 'Unit of measurement',
  })
  unit!: string;

  @ApiProperty({
    description: 'Theoretical stock before count',
  })
  theoreticalStock!: number;

  @ApiProperty({
    description: 'Actual counted stock (Fiili Stok)',
  })
  actualStock!: number;

  @ApiProperty({
    description: 'Difference between actual and theoretical',
  })
  difference!: number;

  @ApiProperty({
    description: 'Fire rate percentage ((Fiili - Teorik) / Teorik * 100)',
  })
  fireRate!: number;

  @ApiProperty({
    description: 'Adjustment movement ID if created',
  })
  adjustmentMovementId?: number;
}

export class StockCountSummaryDto {
  @ApiProperty({
    description: 'Branch ID',
  })
  branchId!: number;

  @ApiProperty({
    description: 'Count performed at',
  })
  countedAt!: Date;

  @ApiProperty({
    description: 'User who performed the count',
  })
  countedById!: number;

  @ApiProperty({
    description: 'Total items counted',
  })
  totalItems!: number;

  @ApiProperty({
    description: 'Items with positive difference (surplus)',
  })
  surplusItems!: number;

  @ApiProperty({
    description: 'Items with negative difference (shortage)',
  })
  shortageItems!: number;

  @ApiProperty({
    description: 'Items with no difference',
  })
  matchingItems!: number;

  @ApiProperty({
    description: 'Total value of adjustments (TRY)',
  })
  totalAdjustmentValue!: number;

  @ApiProperty({
    description: 'Average fire rate across all items',
  })
  averageFireRate!: number;

  @ApiProperty({
    description: 'Detailed results for each item',
    type: [StockCountResultDto],
  })
  results!: StockCountResultDto[];
}

export class WasteReportQueryDto {
  @ApiProperty({
    description: 'Branch ID',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  branchId!: number;

  @ApiProperty({
    description: 'Start date',
    example: '2025-01-01',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: 'End date',
    example: '2025-01-31',
  })
  @IsDateString()
  endDate!: string;
}

export class WasteReportItemDto {
  @ApiProperty()
  ingredientId!: number;

  @ApiProperty()
  ingredientName!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty()
  totalWasteQuantity!: number;

  @ApiProperty()
  totalWasteCost!: number;

  @ApiProperty()
  wasteMovements!: number;

  @ApiProperty()
  averageWastePerDay!: number;
}

export class WasteReportDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  startDate!: string;

  @ApiProperty()
  endDate!: string;

  @ApiProperty()
  totalWasteCost!: number;

  @ApiProperty()
  totalWasteMovements!: number;

  @ApiProperty({
    type: [WasteReportItemDto],
  })
  items!: WasteReportItemDto[];

  @ApiProperty({
    description: 'Daily breakdown of waste',
  })
  dailyBreakdown!: Array<{
    date: string;
    totalQuantity: number;
    totalCost: number;
    movementCount: number;
  }>;
}
