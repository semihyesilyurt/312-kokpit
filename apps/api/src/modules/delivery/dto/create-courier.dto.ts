/**
 * Create Courier DTO
 * Validation for courier creation requests
 */

import {
  IsString,
  IsEmail,
  IsOptional,
  IsInt,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum VehicleType {
  MOTORCYCLE = 'MOTORCYCLE',
  BICYCLE = 'BICYCLE',
  CAR = 'CAR',
  SCOOTER = 'SCOOTER',
  ON_FOOT = 'ON_FOOT',
}

export class CreateCourierDto {
  @ApiProperty({
    description: 'Courier email address',
    example: 'kurye@ornek.com',
  })
  @IsEmail({}, { message: 'Gecerli bir e-posta adresi giriniz' })
  email!: string;

  @ApiProperty({
    description: 'Courier password',
    example: 'guvenli123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'Sifre en az 6 karakter olmalidir' })
  password!: string;

  @ApiProperty({
    description: 'Courier full name',
    example: 'Ahmet Yilmaz',
  })
  @IsString()
  @MinLength(2, { message: 'Isim en az 2 karakter olmalidir' })
  @MaxLength(100, { message: 'Isim en fazla 100 karakter olabilir' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Courier phone number',
    example: '05321234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({
    description: 'Branch ID to assign courier to',
    example: 1,
  })
  @IsInt({ message: 'Sube ID sayisal olmalidir' })
  branchId!: number;

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
}
