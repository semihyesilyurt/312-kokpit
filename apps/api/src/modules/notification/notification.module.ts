/**
 * Notification Module
 * Push notifications, email, SMS management
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationProcessor } from './notification.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, NotificationProcessor],
  exports: [NotificationService],
})
export class NotificationModule {}
