/**
 * Create Product DTO
 * Validation for product creation requests
 */

import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
  IsNotEmpty,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({
    description: 'Product name',
    example: 'Doner Durum',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Product slug (auto-generated if not provided)',
    example: 'doner-durum',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @ApiPropertyOptional({
    description: 'Product description',
    example: 'Delicious doner wrapped in lavash bread',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Category ID',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  categoryId!: number;

  @ApiProperty({
    description: 'Base price',
    example: 45.00,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({
    description: 'Platform-specific prices',
    example: { getir: 47.00, yemeksepeti: 48.00 },
  })
  @IsOptional()
  @IsObject()
  platformPrices?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Product cost',
    example: 25.00,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({
    description: 'Is product active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Is product available for order',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Preparation time in minutes',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  preparationTime?: number;

  @ApiPropertyOptional({
    description: 'Sort order for display',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Product image URL',
    example: 'https://example.com/images/doner.jpg',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
