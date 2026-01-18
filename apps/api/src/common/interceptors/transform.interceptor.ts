/**
 * Transform Interceptor
 * Standardizes successful API responses
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
    [key: string]: unknown;
  };
  timestamp: string;
}

export interface PaginatedData<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // Handle null/undefined responses
        if (data === null || data === undefined) {
          return {
            success: true as const,
            data: null as T,
            timestamp: new Date().toISOString(),
          };
        }

        // Handle paginated responses
        if (this.isPaginatedResponse(data)) {
          const { items, meta } = data as PaginatedData<unknown>;

          // Set pagination headers
          response.setHeader('X-Total-Count', meta.total.toString());
          response.setHeader('X-Page', meta.page.toString());
          response.setHeader('X-Page-Size', meta.pageSize.toString());

          return {
            success: true as const,
            data: items as T,
            meta,
            timestamp: new Date().toISOString(),
          };
        }

        // Handle responses with explicit meta
        if (this.hasMetaProperty(data)) {
          const { meta, ...rest } = data;
          return {
            success: true as const,
            data: rest as T,
            meta,
            timestamp: new Date().toISOString(),
          };
        }

        // Standard response
        return {
          success: true as const,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }

  private isPaginatedResponse(data: unknown): data is PaginatedData<unknown> {
    return (
      typeof data === 'object' &&
      data !== null &&
      'items' in data &&
      'meta' in data &&
      Array.isArray((data as PaginatedData<unknown>).items) &&
      typeof (data as PaginatedData<unknown>).meta === 'object'
    );
  }

  private hasMetaProperty(
    data: unknown,
  ): data is { meta: Record<string, unknown> } {
    return (
      typeof data === 'object' &&
      data !== null &&
      'meta' in data &&
      typeof (data as { meta: unknown }).meta === 'object'
    );
  }
}
