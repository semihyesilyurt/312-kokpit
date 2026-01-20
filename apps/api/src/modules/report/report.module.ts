/**
 * Report Module
 * Comprehensive reporting and analytics with Redis caching
 */

import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [
    // Redis cache configuration for report caching
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('redis.host', 'localhost'),
        port: configService.get<number>('redis.port', 6379),
        password: configService.get<string>('redis.password'),
        db: configService.get<number>('redis.db', 0),
        ttl: 300, // Default 5 minutes TTL
      }),
    }),
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
