/**
 * Environment Variables Validation Schema
 * Uses Joi for comprehensive environment validation at startup
 */

import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  API_PORT: Joi.number().port().default(3001),
  PORT: Joi.number().port().default(3001),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['mysql', 'postgresql'] })
    .required()
    .description('Database connection URL'),

  // Redis
  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().min(0).max(15).default(0),

  // JWT Authentication
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .description('JWT secret key - must be at least 32 characters'),
  JWT_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('24h')
    .description('JWT token expiration time (e.g., 15m, 1h, 24h)'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .description('JWT refresh token secret - must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('7d')
    .description('JWT refresh token expiration time'),

  // Throttling
  THROTTLE_TTL: Joi.number().positive().default(60000).description('Throttle time window in ms'),
  THROTTLE_LIMIT: Joi.number()
    .positive()
    .default(100)
    .description('Max requests per time window'),

  // Swagger
  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('docs'),

  // BullMQ
  BULLMQ_JOB_ATTEMPTS: Joi.number().min(1).max(10).default(3),
  BULLMQ_BACKOFF_DELAY: Joi.number().positive().default(1000),
  BULLMQ_REMOVE_ON_COMPLETE: Joi.number().positive().default(100),
  BULLMQ_REMOVE_ON_FAIL: Joi.number().positive().default(50),

  // Optional: External Services
  SMTP_HOST: Joi.string().hostname().optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  SMTP_FROM: Joi.string().email().optional(),

  // Optional: Push Notifications
  FIREBASE_PROJECT_ID: Joi.string().allow('').optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().allow('').optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().allow('').optional(),

  // Optional: SMS Provider
  SMS_API_KEY: Joi.string().optional(),
  SMS_SENDER_ID: Joi.string().optional(),
});

export const validationOptions: Joi.ValidationOptions = {
  abortEarly: false,
  allowUnknown: true,
  stripUnknown: false,
};
