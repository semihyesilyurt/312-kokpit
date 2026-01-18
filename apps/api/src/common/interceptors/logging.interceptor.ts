/**
 * Logging Interceptor
 * Logs incoming requests and outgoing responses with timing
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

interface RequestUser {
  id?: string;
  email?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, ip, body } = request;
    const userAgent = request.get('User-Agent') || 'unknown';
    const startTime = Date.now();

    // Get user info if available
    const user = request.user as RequestUser | undefined;
    const userId = user?.id || 'anonymous';

    // Log incoming request
    this.logger.log(
      `→ ${method} ${url} - User: ${userId} - IP: ${ip} - Agent: ${userAgent}`,
    );

    // Log request body in development (excluding sensitive fields)
    if (process.env.NODE_ENV === 'development' && body && Object.keys(body).length > 0) {
      const sanitizedBody = this.sanitizeBody(body);
      this.logger.debug(`Request body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log(
            `← ${method} ${url} - ${statusCode} - ${duration}ms`,
          );

          // Warn on slow requests
          if (duration > 3000) {
            this.logger.warn(
              `Slow request detected: ${method} ${url} took ${duration}ms`,
            );
          }
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `← ${method} ${url} - ERROR - ${duration}ms - ${error.message}`,
          );
        },
      }),
    );
  }

  /**
   * Remove sensitive fields from request body for logging
   */
  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'api_key',
      'accessToken',
      'refreshToken',
      'creditCard',
      'cvv',
      'ssn',
    ];

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeBody(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
