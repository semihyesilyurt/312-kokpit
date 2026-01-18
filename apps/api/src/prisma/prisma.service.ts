/**
 * Prisma Service
 * Database client with lifecycle management and health checks
 */

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error' | 'warn'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

    super({
      log:
        nodeEnv === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'event', level: 'error' },
              { emit: 'event', level: 'warn' },
            ]
          : [{ emit: 'event', level: 'error' }],
      errorFormat: nodeEnv === 'development' ? 'pretty' : 'minimal',
    });

    if (nodeEnv === 'development') {
      this.$on('query', (event) => {
        this.logger.debug(`Query: ${event.query}`);
        this.logger.debug(`Duration: ${event.duration}ms`);
      });
    }

    this.$on('error', (event) => {
      this.logger.error(`Database error: ${event.message}`);
    });

    this.$on('warn', (event) => {
      this.logger.warn(`Database warning: ${event.message}`);
    });
  }

  async onModuleInit() {
    this.logger.log('Connecting to database...');
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Health check for database connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute operations within a transaction
   */
  async executeInTransaction<T>(
    fn: (prisma: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<T> {
    return this.$transaction(fn, {
      maxWait: options?.maxWait ?? 5000,
      timeout: options?.timeout ?? 10000,
      isolationLevel: options?.isolationLevel,
    });
  }

  /**
   * Soft delete helper - sets deletedAt timestamp
   */
  softDelete<T extends { deletedAt?: Date | null }>(
    model: T,
  ): T & { deletedAt: Date } {
    return { ...model, deletedAt: new Date() };
  }

  /**
   * Pagination helper
   */
  paginate(page: number = 1, pageSize: number = 20) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    return { take, skip };
  }

  /**
   * Build pagination metadata
   */
  buildPaginationMeta(
    total: number,
    page: number,
    pageSize: number,
  ): {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  } {
    const totalPages = Math.ceil(total / pageSize);
    return {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
