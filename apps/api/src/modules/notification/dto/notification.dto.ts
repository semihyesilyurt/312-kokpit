/**
 * Notification DTOs
 * Validation for notification management endpoints
 */

import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  IsObject,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Notification type enum
 */
export enum NotificationTypeEnum {
  NEW_ORDER = 'NEW_ORDER',
  ORDER_UPDATE = 'ORDER_UPDATE',
  CRITICAL_STOCK = 'CRITICAL_STOCK',
  COURIER_ASSIGNED = 'COURIER_ASSIGNED',
  DELIVERY_COMPLETE = 'DELIVERY_COMPLETE',
  WIN_BACK = 'WIN_BACK',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
}

/**
 * Notification channel enum
 */
export enum NotificationChannelEnum {
  PUSH = 'PUSH',
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
}

/**
 * Send Notification DTO
 */
export class SendNotificationDto {
  @ApiProperty({
    description: 'Recipient user ID',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  recipientId?: number;

  @ApiPropertyOptional({
    description: 'Recipient phone number (for SMS/WhatsApp)',
    example: '+905551234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  recipientPhone?: string;

  @ApiPropertyOptional({
    description: 'Recipient email address',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  recipientEmail?: string;

  @ApiProperty({
    description: 'Notification type',
    enum: NotificationTypeEnum,
    example: NotificationTypeEnum.SYSTEM_ALERT,
  })
  @IsEnum(NotificationTypeEnum)
  type!: NotificationTypeEnum;

  @ApiProperty({
    description: 'Notification channel',
    enum: NotificationChannelEnum,
    example: NotificationChannelEnum.IN_APP,
  })
  @IsEnum(NotificationChannelEnum)
  channel!: NotificationChannelEnum;

  @ApiProperty({
    description: 'Notification title',
    example: 'New Order Received',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Notification body',
    example: 'You have received a new order from Getir.',
  })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({
    description: 'Additional data payload',
    example: { orderId: 123, platform: 'GETIR' },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Priority level (0-3, higher = more important)',
    example: 1,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Schedule notification for later (ISO 8601)',
    example: '2026-01-17T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/**
 * Broadcast Notification DTO
 */
export class BroadcastNotificationDto {
  @ApiPropertyOptional({
    description: 'Specific user IDs to broadcast to',
    example: [1, 2, 3],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];

  @ApiPropertyOptional({
    description: 'Target branch ID',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Target user role',
    example: 'BRANCH_MANAGER',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({
    description: 'Notification type',
    enum: NotificationTypeEnum,
    example: NotificationTypeEnum.SYSTEM_ALERT,
  })
  @IsEnum(NotificationTypeEnum)
  type!: NotificationTypeEnum;

  @ApiProperty({
    description: 'Notification channels to use',
    enum: NotificationChannelEnum,
    isArray: true,
    example: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.PUSH],
  })
  @IsArray()
  @IsEnum(NotificationChannelEnum, { each: true })
  channels!: NotificationChannelEnum[];

  @ApiProperty({
    description: 'Notification title',
    example: 'System Maintenance',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Notification body',
    example: 'System will be under maintenance from 10:00 to 12:00.',
  })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({
    description: 'Additional data payload',
    example: { maintenanceType: 'scheduled' },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

/**
 * Notification Query DTO
 */
export class NotificationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter unread only',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by type',
    enum: NotificationTypeEnum,
  })
  @IsOptional()
  @IsEnum(NotificationTypeEnum)
  type?: NotificationTypeEnum;

  @ApiPropertyOptional({
    description: 'Filter by channel',
    enum: NotificationChannelEnum,
  })
  @IsOptional()
  @IsEnum(NotificationChannelEnum)
  channel?: NotificationChannelEnum;
}

/**
 * FCM Token DTO
 */
export class RegisterFcmTokenDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging token',
    example: 'dGVzdC10b2tlbi1mb3ItZmNt...',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({
    description: 'Device type',
    example: 'android',
  })
  @IsOptional()
  @IsString()
  deviceType?: string;
}
