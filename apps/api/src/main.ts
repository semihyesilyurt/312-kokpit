/**
 * Kokpit API - Application Entry Point
 * 312 Doner Restaurant Management System
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import type { Configuration } from './config/configuration';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bufferLogs: true,
  });

  const configService = app.get(ConfigService<Configuration>);
  const appConfig = configService.get('app', { infer: true });
  const swaggerConfig = configService.get('swagger', { infer: true });

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Compression
  app.use(compression());

  // CORS configuration
  app.enableCors({
    origin: appConfig?.corsOrigins || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Page-Size'],
    credentials: true,
    maxAge: 86400,
  });

  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global prefix
  const apiPrefix = appConfig?.apiPrefix || 'api/v1';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'docs', 'docs-json'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: appConfig?.nodeEnv === 'production',
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // WebSocket adapter for Socket.IO
  app.useWebSocketAdapter(new IoAdapter(app));

  // Swagger documentation
  if (swaggerConfig?.enabled) {
    const swaggerDocConfig = new DocumentBuilder()
      .setTitle(swaggerConfig.title)
      .setDescription(swaggerConfig.description)
      .setVersion(swaggerConfig.version)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Auth', 'Authentication and authorization endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Orders', 'Order management endpoints')
      .addTag('Stock', 'Stock and inventory management endpoints')
      .addTag('Recipes', 'Recipe and menu management endpoints')
      .addTag('Delivery', 'Delivery management endpoints')
      .addTag('Customers', 'Customer management endpoints')
      .addTag('Platforms', 'External platform integration endpoints')
      .addTag('POS', 'Point of sale endpoints')
      .addTag('Reports', 'Reporting and analytics endpoints')
      .addTag('Rules', 'Rule engine endpoints')
      .addTag('Notifications', 'Notification management endpoints')
      .addServer(`http://localhost:${appConfig?.port || 3001}`, 'Local Development')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerDocConfig);
    SwaggerModule.setup(swaggerConfig.path, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
      customSiteTitle: 'Kokpit API Documentation',
    });

    logger.log(`Swagger documentation available at /${swaggerConfig.path}`);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = appConfig?.port || 3001;
  await app.listen(port);

  logger.log(`Application running on port ${port}`);
  logger.log(`Environment: ${appConfig?.nodeEnv || 'development'}`);
  logger.log(`API prefix: ${apiPrefix}`);

  if (appConfig?.nodeEnv === 'development') {
    logger.log(`API URL: http://localhost:${port}/${apiPrefix}`);
    logger.log(`Swagger: http://localhost:${port}/${swaggerConfig?.path || 'docs'}`);
  }
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
