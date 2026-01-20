/**
 * Platform Sync Scheduler
 * Cron job that runs every 2 minutes to sync orders from all active platforms
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PlatformService } from './platform.service';

@Injectable()
export class PlatformSyncScheduler {
  private readonly logger = new Logger(PlatformSyncScheduler.name);
  private isSyncing = false;

  constructor(
    private readonly platformService: PlatformService,
    @InjectQueue('platform-sync') private readonly syncQueue: Queue,
  ) {}

  /**
   * Sync orders from all active platforms every 2 minutes
   * CronExpression format: second minute hour day-of-month month day-of-week
   */
  @Cron('0 */2 * * * *') // Every 2 minutes at second 0
  async syncOrders() {
    // Prevent overlapping syncs
    if (this.isSyncing) {
      this.logger.warn('Previous sync still in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.logger.log('Starting scheduled platform order sync');

    try {
      // Get all active platforms
      const activePlatforms = await this.platformService.getActivePlatforms();

      if (activePlatforms.length === 0) {
        this.logger.debug('No active platforms to sync');
        return;
      }

      this.logger.debug(`Found ${activePlatforms.length} active platforms`);

      // Queue sync job for each active platform
      const jobs = await Promise.all(
        activePlatforms.map((platform) =>
          this.syncQueue.add(
            'sync-orders',
            {
              platform,
              triggeredManually: false,
            },
            {
              priority: 5, // Lower priority than manual triggers
              attempts: 2,
              backoff: {
                type: 'exponential',
                delay: 3000,
              },
            },
          ),
        ),
      );

      this.logger.log(
        `Queued ${jobs.length} order sync jobs for platforms: ${activePlatforms.join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule platform sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Health check - runs every 5 minutes to verify sync is working
   */
  @Cron('0 */5 * * * *') // Every 5 minutes
  async healthCheck() {
    try {
      const queueStatus = await this.syncQueue.getJobCounts();
      this.logger.debug(
        `Platform sync queue status: waiting=${queueStatus.waiting}, active=${queueStatus.active}, completed=${queueStatus.completed}, failed=${queueStatus.failed}`,
      );

      // Alert if too many failed jobs
      if (queueStatus.failed > 10) {
        this.logger.warn(
          `High number of failed platform sync jobs: ${queueStatus.failed}`,
        );
      }

      // Alert if queue is backing up
      if (queueStatus.waiting > 20) {
        this.logger.warn(
          `Platform sync queue backing up: ${queueStatus.waiting} waiting jobs`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Clean up old completed/failed jobs daily at 3 AM
   */
  @Cron('0 0 3 * * *') // Every day at 3 AM
  async cleanupJobs() {
    this.logger.log('Starting daily job cleanup');

    try {
      // Remove completed jobs older than 1 hour
      const completedRemoved = await this.syncQueue.clean(
        3600 * 1000, // 1 hour
        100, // limit
        'completed',
      );

      // Remove failed jobs older than 24 hours
      const failedRemoved = await this.syncQueue.clean(
        24 * 3600 * 1000, // 24 hours
        100, // limit
        'failed',
      );

      this.logger.log(
        `Job cleanup complete: ${completedRemoved.length} completed, ${failedRemoved.length} failed jobs removed`,
      );
    } catch (error) {
      this.logger.error(
        `Job cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
