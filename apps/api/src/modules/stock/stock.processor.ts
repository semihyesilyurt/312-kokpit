/**
 * Stock Processor
 * Queue processor for stock-related background jobs
 * Handles critical stock alerts and notifications
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';

interface CriticalStockData {
  event: string;
  data: {
    ingredientId: number;
    branchId: number;
    currentStock: number;
    minStock: number;
    ingredientName: string;
    severity: 'CRITICAL' | 'OUT_OF_STOCK';
    timestamp: string;
  };
}

@Processor('stock')
export class StockProcessor extends WorkerHost {
  private readonly logger = new Logger(StockProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<CriticalStockData>): Promise<void> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'stock.critical':
        await this.handleCriticalStock(job.data);
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  /**
   * Handle critical stock alert
   * Creates notification for branch managers and admins
   */
  private async handleCriticalStock(data: CriticalStockData): Promise<void> {
    const { ingredientId, branchId, currentStock, minStock, ingredientName, severity } = data.data;

    this.logger.warn(
      `Processing critical stock alert: ${ingredientName} at ${currentStock} (min: ${minStock}) - ${severity}`,
    );

    try {
      // Get branch info
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true },
      });

      if (!branch) {
        this.logger.error(`Branch ${branchId} not found for critical stock alert`);
        return;
      }

      // Get users to notify (branch managers and admins)
      const usersToNotify = await this.prisma.user.findMany({
        where: {
          OR: [
            { role: 'ADMIN' },
            { role: 'OPERATION_MANAGER' },
            { branchId, role: 'BRANCH_MANAGER' },
          ],
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      // Determine notification priority and message
      const isOutOfStock = severity === 'OUT_OF_STOCK';
      const title = isOutOfStock
        ? `Stok Bitti: ${ingredientName}`
        : `Kritik Stok: ${ingredientName}`;
      const body = isOutOfStock
        ? `${branch.name} subesinde ${ingredientName} stoku tamamen tukendi!`
        : `${branch.name} subesinde ${ingredientName} stoku kritik seviyede (${currentStock} kaldi, min: ${minStock})`;

      // Create notifications in bulk
      if (usersToNotify.length > 0) {
        await this.prisma.notification.createMany({
          data: usersToNotify.map((user) => ({
            type: 'CRITICAL_STOCK',
            channel: 'IN_APP',
            recipientId: user.id,
            title,
            body,
            priority: isOutOfStock ? 2 : 1,
            data: {
              ingredientId,
              branchId,
              currentStock,
              minStock,
              severity,
            },
          })),
        });

        this.logger.log(
          `Created ${usersToNotify.length} critical stock notifications for ${ingredientName}`,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to process critical stock alert: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}
