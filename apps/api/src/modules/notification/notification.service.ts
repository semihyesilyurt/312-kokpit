/**
 * Notification Service
 * Notification management business logic
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType, NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';

interface FindAllOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {}

  async findAll(recipientId: number, options: FindAllOptions = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const where: Record<string, unknown> = { recipientId };
    if (unreadOnly) where.readAt = null;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        skip,
        take,
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items: notifications,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  async getUnreadCount(recipientId: number) {
    const count = await this.prisma.notification.count({
      where: { recipientId, readAt: null },
    });

    return { unreadCount: count };
  }

  async markAsRead(id: number, recipientId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return updated;
  }

  async markAllAsRead(recipientId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });

    return { markedAsRead: result.count };
  }

  async send(data: unknown) {
    const notificationData = data as {
      recipientId: number;
      type: NotificationType;
      channel?: NotificationChannel;
      title: string;
      body: string;
      data?: Prisma.InputJsonValue;
      channels?: NotificationChannel[];
    };

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: notificationData.recipientId,
        type: notificationData.type,
        channel: notificationData.channel ?? NotificationChannel.IN_APP,
        title: notificationData.title,
        body: notificationData.body,
        data: notificationData.data,
      },
    });

    // Send real-time notification (convert to string for WebSocket room)
    this.notificationGateway.sendToUser(String(notificationData.recipientId), notification);

    // Queue for additional channels (push, email, SMS)
    if (notificationData.channels?.length) {
      await this.notificationQueue.add('send-channels', {
        notificationId: notification.id,
        recipientId: notificationData.recipientId,
        channels: notificationData.channels,
      });
    }

    this.logger.log(`Notification sent to user ${notificationData.recipientId}`);
    return notification;
  }

  async broadcast(data: unknown) {
    const broadcastData = data as {
      userIds?: number[];
      branchId?: number;
      role?: string;
      type: NotificationType;
      channel?: NotificationChannel;
      title: string;
      body: string;
      data?: Prisma.InputJsonValue;
    };

    // Get target users (User model uses status enum, not isActive boolean)
    const userWhere: Record<string, unknown> = { status: 'ACTIVE' };
    if (broadcastData.userIds) userWhere.id = { in: broadcastData.userIds };
    if (broadcastData.branchId) userWhere.branchId = broadcastData.branchId;
    if (broadcastData.role) userWhere.role = broadcastData.role;

    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: { id: true },
    });

    // Create notifications in bulk
    const notifications = await this.prisma.notification.createMany({
      data: users.map((user) => ({
        recipientId: user.id,
        type: broadcastData.type,
        channel: broadcastData.channel ?? NotificationChannel.IN_APP,
        title: broadcastData.title,
        body: broadcastData.body,
        data: broadcastData.data,
      })),
    });

    // Send real-time notifications (convert to string for WebSocket room)
    for (const user of users) {
      this.notificationGateway.sendToUser(String(user.id), {
        type: broadcastData.type,
        title: broadcastData.title,
        body: broadcastData.body,
        data: broadcastData.data,
      });
    }

    this.logger.log(`Broadcast sent to ${users.length} users`);
    return { sentTo: users.length, created: notifications.count };
  }

  async createSystemNotification(
    recipientId: number,
    type: NotificationType,
    title: string,
    body: string,
    data?: Prisma.InputJsonValue,
  ) {
    return this.send({
      recipientId,
      type,
      title,
      body,
      data,
      channels: [NotificationChannel.PUSH],
    });
  }
}
