/**
 * Product Query DTO
 * Validation for product list filtering and pagination
 */

import {
  IsOptional,
  IsInt,
  IsString,
  IsBoolean,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum ProductSortField {
  NAME = 'name',
  BASE_PRICE = 'basePrice',
  CREATED_AT = 'createdAt',
  SORT_ORDER = 'sortOrder',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ProductQueryDto {
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
    description: 'Filter by category ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by availability',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Search by name or description',
    example: 'doner',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ProductSortField,
    default: ProductSortField.SORT_ORDER,
  })
  @IsOptional()
  @IsEnum(ProductSortField)
  sortBy?: ProductSortField = ProductSortField.SORT_ORDER;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.ASC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;
}
