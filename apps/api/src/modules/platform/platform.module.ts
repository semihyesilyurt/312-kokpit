/**
 * Platform Module
 * External platform integrations (Getir, Yemeksepeti, Trendyol, Migros) with:
 * - PlatformAdapter interface for standardized integration
 * - GetirAdapter implementation (real - 10s polling)
 * - MigrosAdapter implementation (real - 20s polling)
 * - TrendyolAdapter implementation (real - 10s polling)
 * - Cron job every 2 minutes for general order sync via BullMQ
 * - Platform status toggle and sync logging
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformSyncProcessor } from './platform-sync.processor';
import { PlatformSyncScheduler } from './platform-sync.scheduler';
import { MigrosSyncScheduler } from './migros-sync.scheduler';
import { TrendyolSyncScheduler } from './trendyol-sync.scheduler';
import { GetirSyncScheduler } from './getir-sync.scheduler';
import { GetirAdapter } from './adapters/getir.adapter';
import { MigrosAdapter } from './adapters/migros.adapter';
import { TrendyolAdapter } from './adapters/trendyol.adapter';
import { OrderModule } from '@modules/order/order.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'platform-sync',
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    ScheduleModule,
    OrderModule,
  ],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    PlatformSyncProcessor,
    PlatformSyncScheduler,
    MigrosSyncScheduler,
    TrendyolSyncScheduler,
    GetirSyncScheduler,
    GetirAdapter,
    MigrosAdapter,
    TrendyolAdapter,
    {
      provide: 'PLATFORM_ADAPTERS',
      useFactory: (
        getirAdapter: GetirAdapter,
        migrosAdapter: MigrosAdapter,
        trendyolAdapter: TrendyolAdapter,
      ) => ({
        GETIR: getirAdapter,
        MIGROS: migrosAdapter,
        TRENDYOL: trendyolAdapter,
        // Future adapters:
        // YEMEKSEPETI: yemeksepetiAdapter,
      }),
      inject: [GetirAdapter, MigrosAdapter, TrendyolAdapter],
    },
  ],
  exports: [PlatformService, TrendyolSyncScheduler, GetirSyncScheduler],
})
export class PlatformModule {}
