/**
 * Update Courier DTO
 * Validation for courier update requests
 */

import {
  IsString,
  IsOptional,
  IsInt,
  MinLength,
  MaxLength,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from './create-courier.dto';

export class UpdateCourierDto {
  @ApiPropertyOptional({
    description: 'Courier full name',
    example: 'Ahmet Yilmaz',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Isim en az 2 karakter olmalidir' })
  @MaxLength(100, { message: 'Isim en fazla 100 karakter olabilir' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Courier phone number',
    example: '05321234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: 'New password (optional)',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Sifre en az 6 karakter olmalidir' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Branch ID to assign courier to',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Sube ID sayisal olmalidir' })
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Vehicle type',
    enum: VehicleType,
    example: VehicleType.MOTORCYCLE,
  })
  @IsOptional()
  @IsEnum(VehicleType, {
    message: 'Arac tipi: MOTORCYCLE, BICYCLE, CAR, SCOOTER, ON_FOOT',
  })
  vehicleType?: VehicleType;

  @ApiPropertyOptional({
    description: 'Vehicle plate number',
    example: '34ABC123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;

  @ApiPropertyOptional({
    description: 'Is courier active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
