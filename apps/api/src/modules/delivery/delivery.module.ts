/**
 * Delivery Module
 * Comprehensive delivery and courier logistics management
 * Includes auto-assignment, cash balance tracking, and real-time WebSocket updates
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryGateway } from './delivery.gateway';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'delivery',
    }),
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryGateway],
  exports: [DeliveryService, DeliveryGateway],
})
export class DeliveryModule {}
