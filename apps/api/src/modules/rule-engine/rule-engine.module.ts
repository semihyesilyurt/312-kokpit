/**
 * Rule Engine Module
 * Business rules management with scheduled evaluation
 *
 * Features:
 * - Rule CRUD operations
 * - Cron-based rule evaluation (every minute)
 * - Cooldown support between executions
 * - Rollback capability for reversible actions
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { RuleEngineController } from './rule-engine.controller';
import { RuleEngineService } from './rule-engine.service';

@Module({
  imports: [
    // Schedule module for cron jobs
    ScheduleModule.forRoot(),
    // Queue for async rule execution
    BullModule.registerQueue({
      name: 'rules',
    }),
  ],
  controllers: [RuleEngineController],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
