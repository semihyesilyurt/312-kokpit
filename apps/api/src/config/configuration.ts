/**
 * Application Configuration
 * Centralized configuration management for the Kokpit API
 */

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
}

export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface ThrottlerConfig {
  ttl: number;
  limit: number;
}

export interface SwaggerConfig {
  enabled: boolean;
  title: string;
  description: string;
  version: string;
  path: string;
}

export interface BullMQConfig {
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: string;
      delay: number;
    };
    removeOnComplete: number;
    removeOnFail: number;
  };
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  throttler: ThrottlerConfig;
  swagger: SwaggerConfig;
  bullmq: BullMQConfig;
}

export default (): Configuration => ({
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.API_PORT || process.env.PORT || '3001', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
  },

  database: {
    url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/kokpit',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'kokpit-jwt-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || 'kokpit-jwt-refresh-secret-change-in-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  throttler: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    title: 'Kokpit API',
    description: '312 Doner Restaurant Management System API Documentation',
    version: '1.0.0',
    path: process.env.SWAGGER_PATH || 'docs',
  },

  bullmq: {
    defaultJobOptions: {
      attempts: parseInt(process.env.BULLMQ_JOB_ATTEMPTS || '3', 10),
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.BULLMQ_BACKOFF_DELAY || '1000', 10),
      },
      removeOnComplete: parseInt(process.env.BULLMQ_REMOVE_ON_COMPLETE || '100', 10),
      removeOnFail: parseInt(process.env.BULLMQ_REMOVE_ON_FAIL || '50', 10),
    },
  },
});
