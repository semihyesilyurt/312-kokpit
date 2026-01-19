/**
 * Create Order DTO
 * Validation for order creation request
 */

import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
  MaxLength,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

/**
 * Normalize enum value: lowercase → UPPERCASE
 */
function normalizeEnumValue(value: string): string {
  return value.toUpperCase();
}

/**
 * Platform enum matching Prisma schema
 */
export enum Platform {
  GETIR = 'GETIR',
  YEMEKSEPETI = 'YEMEKSEPETI',
  TRENDYOL = 'TRENDYOL',
  MIGROS = 'MIGROS',
  DIRECT = 'DIRECT',
  POS = 'POS',
}

/**
 * Payment method enum matching Prisma schema
 */
export enum PaymentMethod {
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
  ONLINE = 'ONLINE',
  MEAL_CARD = 'MEAL_CARD',
}

/**
 * Order item DTO for individual products in an order
 */
export class CreateOrderItemDto {
  @ApiProperty({
    description: 'Product ID',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  productId!: number;

  @ApiProperty({
    description: 'Quantity of the product',
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Unit price override (uses product price if not provided)',
    example: 45.50,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({
    description: 'Special notes for this item',
    example: 'Extra sauce',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Customer information for order creation
 */
export class OrderCustomerDto {
  @ApiProperty({
    description: 'Customer name',
    example: 'John Doe',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Customer phone number',
    example: '+905551234567',
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional({
    description: 'Delivery address',
    example: 'Ataturk Mah. 123 Sok. No:5 Istanbul',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    description: 'Customer notes or delivery instructions',
    example: 'Ring the bell twice',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Delivery latitude coordinate',
    example: 41.0082,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Delivery longitude coordinate',
    example: 28.9784,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  longitude?: number;
}

/**
 * Create Order DTO
 */
export class CreateOrderDto {
  @ApiProperty({
    description: 'Branch ID for the order',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  branchId!: number;

  @ApiProperty({
    description: 'Order platform source',
    enum: Platform,
    example: Platform.DIRECT,
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEnumValue(value) : value))
  @IsEnum(Platform, { message: 'Invalid platform' })
  platform!: Platform;

  @ApiPropertyOptional({
    description: 'External platform order ID',
    example: 'GETIR-12345',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformOrderId?: string;

  @ApiProperty({
    description: 'Customer information',
    type: OrderCustomerDto,
  })
  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer!: OrderCustomerDto;

  @ApiProperty({
    description: 'Order items',
    type: [CreateOrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEnumValue(value) : value))
  @IsEnum(PaymentMethod, { message: 'Invalid payment method' })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Discount amount',
    example: 10.00,
    default: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({
    description: 'Delivery fee',
    example: 15.00,
    default: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee?: number;

  @ApiPropertyOptional({
    description: 'Estimated delivery time in minutes',
    example: 45,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDeliveryMinutes?: number;
}
