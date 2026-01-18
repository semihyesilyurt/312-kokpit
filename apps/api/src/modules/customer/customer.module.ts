/**
 * Customer Module
 * Customer management and CRM with:
 * - Sleeping customer detection (30+ days without order)
 * - Loyalty program with 3rd order trigger
 * - Win-back campaigns via SMS/WhatsApp
 * - Customer statistics and analytics
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { NotificationModule } from '@modules/notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'customer-winback',
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600,
          count: 500,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }),
    EventEmitterModule.forRoot(),
    NotificationModule,
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
