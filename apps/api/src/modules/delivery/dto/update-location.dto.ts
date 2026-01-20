/**
 * Update Location DTO
 * Validation for courier location update requests
 */

import { IsNumber, IsOptional, Min, Max, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLocationDto {
  @ApiProperty({
    description: 'Latitude coordinate',
    example: 41.0082,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber({}, { message: 'Latitude must be a number' })
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  latitude!: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: 28.9784,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber({}, { message: 'Longitude must be a number' })
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  longitude!: number;

  @ApiPropertyOptional({
    description: 'Accuracy of the location in meters',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @ApiPropertyOptional({
    description: 'Speed in meters per second',
    example: 5.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number;

  @ApiPropertyOptional({
    description: 'Heading in degrees (0-360)',
    example: 180,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiPropertyOptional({
    description: 'Associated order ID for the location update',
    example: 'ord_123',
  })
  @IsOptional()
  @IsString()
  orderId?: string;
}
