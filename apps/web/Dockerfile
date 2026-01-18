# ============================================
# Kokpit Web - Multi-stage Dockerfile
# ============================================
# Build: docker build -t kokpit-web .
# Run: docker run -p 3000:3000 kokpit-web

# ============================================
# Base stage - Common setup
# ============================================
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

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
COPY apps/web/package.json ./apps/web/
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
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build Next.js application
WORKDIR /app/apps/web

# Set environment variables for build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

# Enable standalone output for optimized production build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN pnpm build

# ============================================
# Development stage - For local development
# ============================================
FROM base AS development

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/apps/web

# Expose port
EXPOSE 3000

# Development command with hot reload
CMD ["pnpm", "dev"]

# ============================================
# Production stage - Optimized for deployment
# ============================================
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy public assets
COPY --from=builder /app/apps/web/public ./public

# Copy standalone build (Next.js 13+ standalone output)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Production command (standalone server)
CMD ["node", "apps/web/server.js"]
