/**
 * Global HTTP Exception Filter
 * Standardizes error responses across the application
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  details?: Record<string, unknown> | unknown[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    // Log the error
    this.logError(exception, errorResponse, request);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(
    exception: unknown,
    request: Request,
  ): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;

    // Handle HTTP exceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message: string;
      let details: Record<string, unknown> | unknown[] | undefined;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message =
          (responseObj.message as string) ||
          (Array.isArray(responseObj.message)
            ? (responseObj.message as string[]).join(', ')
            : exception.message);
        details = responseObj.errors as Record<string, unknown> | undefined;
      } else {
        message = exception.message;
      }

      return {
        success: false,
        statusCode: status,
        message,
        error: HttpStatus[status] || 'Error',
        timestamp,
        path,
        details,
      };
    }

    // Handle Prisma errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception, timestamp, path);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Database validation error',
        error: 'Bad Request',
        timestamp,
        path,
      };
    }

    // Handle generic errors
    const error = exception as Error;
    return {
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message || 'Unknown error',
      error: 'Internal Server Error',
      timestamp,
      path,
    };
  }

  private handlePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    timestamp: string,
    path: string,
  ): ErrorResponse {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[]) || ['field'];
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: `Unique constraint violation on ${target.join(', ')}`,
          error: 'Conflict',
          timestamp,
          path,
        };
      }
      case 'P2003':
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint violation',
          error: 'Bad Request',
          timestamp,
          path,
        };
      case 'P2025':
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
          timestamp,
          path,
        };
      case 'P2014':
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Required relation violation',
          error: 'Bad Request',
          timestamp,
          path,
        };
      default:
        return {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          error: 'Internal Server Error',
          timestamp,
          path,
        };
    }
  }

  private logError(
    exception: unknown,
    errorResponse: ErrorResponse,
    request: Request,
  ): void {
    const logContext = {
      statusCode: errorResponse.statusCode,
      path: errorResponse.path,
      method: request.method,
      ip: request.ip,
      userAgent: request.get('User-Agent'),
    };

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${errorResponse.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
        logContext,
      );
    } else if (errorResponse.statusCode >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} - ${errorResponse.statusCode}: ${errorResponse.message}`,
        logContext,
      );
    }
  }
}
