# ============================================
# Kokpit API - Multi-stage Dockerfile
# ============================================
# Build: docker build -t kokpit-api .
# Run: docker run -p 3001:3001 kokpit-api

# ============================================
# Base stage - Common setup
# ============================================
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# ============================================
# Dependencies stage - Install all deps
# ============================================
FROM base AS deps

# Copy workspace configuration
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./

# Copy package.json files for all workspaces
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# ============================================
# Builder stage - Build the application
# ============================================
FROM base AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build API
WORKDIR /app/apps/api

# Generate Prisma client
RUN npx prisma generate

# Build NestJS application
RUN pnpm build

# ============================================
# Development stage - For local development
# ============================================
FROM base AS development

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/apps/api

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3001

# Development command with hot reload
CMD ["pnpm", "dev"]

# ============================================
# Production stage - Optimized for deployment
# ============================================
FROM node:20-alpine AS production

# Install pnpm for running commands
RUN corepack enable && corepack prepare pnpm@latest --activate

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Install openssl for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json

# Copy Prisma schema and migrations for runtime
COPY --from=builder /app/apps/api/prisma ./prisma

# Copy shared package build
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

# Set ownership
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3001

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Production command
CMD ["node", "dist/main"]
