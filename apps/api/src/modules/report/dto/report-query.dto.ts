/**
 * Report Query DTOs
 * Validation for report endpoints
 */

import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ReportGroupBy {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum DateRange {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
}

export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
}

export class DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Start date (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (ISO 8601)',
    example: '2026-01-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Date range preset',
    enum: DateRange,
    default: DateRange.TODAY,
  })
  @IsOptional()
  @IsEnum(DateRange)
  range?: DateRange = DateRange.TODAY;

  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

export class DashboardQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

export class KpisQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

export class SalesReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Group results by time period',
    enum: ReportGroupBy,
    default: ReportGroupBy.DAY,
  })
  @IsOptional()
  @IsEnum(ReportGroupBy)
  groupBy?: ReportGroupBy;

  @ApiPropertyOptional({
    description: 'Platform filter',
    example: 'GETIR',
  })
  @IsOptional()
  @IsString()
  platform?: string;
}

export class PlatformComparisonQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

export class ProductPerformanceQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Category ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Number of top products to return',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CourierPerformanceQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Courier ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courierId?: number;
}

export class ProfitabilityQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Group results by time period',
    enum: ReportGroupBy,
    default: ReportGroupBy.DAY,
  })
  @IsOptional()
  @IsEnum(ReportGroupBy)
  groupBy?: ReportGroupBy;
}

export class GenerateDailyReportDto {
  @ApiPropertyOptional({
    description: 'Report date (defaults to yesterday)',
    example: '2026-01-16',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Branch ID (generates for all branches if not specified)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

export class ExportReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Report type to export',
    example: 'sales',
  })
  @IsOptional()
  @IsString()
  reportType?: string;

  @ApiPropertyOptional({
    description: 'Export format',
    enum: ExportFormat,
    default: ExportFormat.CSV,
  })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;

  @ApiPropertyOptional({
    description: 'Branch ID filter',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}
