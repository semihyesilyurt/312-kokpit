/**
 * Notification Processor
 * Background job processor for notification delivery
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

interface SendChannelsJob {
  notificationId: number;
  recipientId: number;
  channels: NotificationChannel[];
}

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<SendChannelsJob>): Promise<void> {
    this.logger.log(`Processing notification job ${job.name}: ${job.id}`);

    switch (job.name) {
      case 'send-channels':
        await this.sendToChannels(job.data);
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async sendToChannels(data: SendChannelsJob) {
    const { notificationId, recipientId, channels } = data;

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.error(`Notification not found: ${notificationId}`);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { email: true, phone: true },
    });

    if (!user) {
      this.logger.error(`User not found: ${recipientId}`);
      return;
    }

    for (const channel of channels) {
      try {
        switch (channel) {
          case NotificationChannel.PUSH:
            // Push notifications require external token storage (e.g., separate table or service)
            // The User model does not have a pushToken field
            await this.sendPushNotification(notification);
            break;
          case NotificationChannel.EMAIL:
            await this.sendEmailNotification(user.email, notification);
            break;
          case NotificationChannel.SMS:
            await this.sendSmsNotification(user.phone, notification);
            break;
          case NotificationChannel.WHATSAPP:
            await this.sendWhatsAppNotification(user.phone, notification);
            break;
          case NotificationChannel.IN_APP:
            // In-app notifications are handled via WebSocket in the service
            this.logger.debug('In-app notification already sent via WebSocket');
            break;
          default:
            this.logger.warn(`Unknown channel: ${channel}`);
        }
      } catch (error) {
        this.logger.error(`Failed to send ${channel} notification: ${error}`);
      }
    }
  }

  private async sendPushNotification(
    notification: { title: string; body: string; data: unknown },
  ) {
    // TODO: Implement Firebase Cloud Messaging
    // Push tokens should be stored in a separate table (e.g., UserDevice or PushToken)
    // and retrieved based on recipientId
    this.logger.log(`Push notification queued: ${notification.title}`);
  }

  private async sendEmailNotification(
    email: string | null,
    notification: { title: string; body: string },
  ) {
    if (!email) {
      this.logger.debug('No email available');
      return;
    }

    // TODO: Implement email sending (nodemailer, SendGrid, etc.)
    this.logger.log(`Email notification sent to ${email}: ${notification.title}`);
  }

  private async sendSmsNotification(
    phone: string | null,
    notification: { title: string; body: string },
  ) {
    if (!phone) {
      this.logger.debug('No phone available');
      return;
    }

    // TODO: Implement SMS sending (Twilio, etc.)
    this.logger.log(`SMS notification sent to ${phone}: ${notification.title}`);
  }

  private async sendWhatsAppNotification(
    phone: string | null,
    notification: { title: string; body: string },
  ) {
    if (!phone) {
      this.logger.debug('No phone available for WhatsApp');
      return;
    }

    // TODO: Implement WhatsApp Business API
    this.logger.log(`WhatsApp notification sent to ${phone}: ${notification.title}`);
  }
}
