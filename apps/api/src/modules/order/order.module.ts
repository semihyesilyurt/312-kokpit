/**
 * Order Module
 * Comprehensive order management module with:
 * - REST API endpoints for order CRUD operations
 * - WebSocket gateway for real-time updates
 * - Background job processing with BullMQ
 * - Stock integration for inventory management
 * - Customer relationship tracking
 */

import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderGateway } from './order.gateway';
import { OrderProcessor } from './order.processor';

@Module({
  imports: [
    // Register BullMQ queue for order processing
    BullModule.registerQueue({
      name: 'orders',
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 24 * 3600, // Keep failed jobs for 24 hours
        },
        attempts: 3, // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 1000, // Start with 1 second delay
        },
      },
    }),

    // JWT module for WebSocket authentication
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_SECRET', 'default-secret'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '1d') as JwtSignOptions['expiresIn'],
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderGateway,
    OrderProcessor,
  ],
  exports: [OrderService, OrderGateway],
})
export class OrderModule {}
