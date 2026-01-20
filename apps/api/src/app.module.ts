/**
 * Root Application Module
 * Orchestrates all feature modules and global configurations
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { configuration, validationSchema, validationOptions } from './config';

// Common modules
import { PrismaModule } from './prisma/prisma.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { OrderModule } from './modules/order/order.module';
import { StockModule } from './modules/stock/stock.module';
import { RecipeModule } from './modules/recipe/recipe.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { CustomerModule } from './modules/customer/customer.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PosModule } from './modules/pos/pos.module';
import { ReportModule } from './modules/report/report.module';
import { RuleEngineModule } from './modules/rule-engine/rule-engine.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProductModule } from './modules/product/product.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions,
      envFilePath: ['.env.local', '.env'],
      cache: true,
      expandVariables: true,
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('throttler.ttl', 60000),
            limit: configService.get<number>('throttler.limit', 100),
          },
        ],
      }),
    }),

    // Task scheduling
    ScheduleModule.forRoot(),

    // Queue management with BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db', 0),
        },
        defaultJobOptions: configService.get('bullmq.defaultJobOptions'),
      }),
    }),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    UserModule,
    OrderModule,
    StockModule,
    RecipeModule,
    DeliveryModule,
    CustomerModule,
    PlatformModule,
    PosModule,
    ReportModule,
    RuleEngineModule,
    NotificationModule,
    ProductModule,
  ],
  providers: [
    // Global throttler guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global response transformation
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global request logging
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
