/**
 * POS Module
 * Point of Sale operations with:
 * - Quick sale (walk-in orders)
 * - Table management (open, add items, close)
 * - Daily cash summary with payment method breakdown
 * - Session management
 */

import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { OrderModule } from '@modules/order/order.module';
import { CustomerModule } from '@modules/customer/customer.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'pos-operations',
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600,
          count: 500,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
      },
    }),
    forwardRef(() => OrderModule),
    CustomerModule,
  ],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
