/**
 * Notification Controller
 * Notification management endpoints
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    const recipientId = parseInt(user.id, 10);
    return this.notificationService.findAll(recipientId, { page, limit, unreadOnly });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser() user: CurrentUserData) {
    const recipientId = parseInt(user.id, 10);
    return this.notificationService.getUnreadCount(recipientId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    const recipientId = parseInt(user.id, 10);
    return this.notificationService.markAsRead(id, recipientId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentUser() user: CurrentUserData) {
    const recipientId = parseInt(user.id, 10);
    return this.notificationService.markAllAsRead(recipientId);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a notification' })
  send(@Body() sendNotificationDto: unknown) {
    return this.notificationService.send(sendNotificationDto);
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Broadcast notification to multiple users' })
  broadcast(@Body() broadcastDto: unknown) {
    return this.notificationService.broadcast(broadcastDto);
  }
}
