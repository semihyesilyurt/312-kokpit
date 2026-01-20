# ============================================
# Kokpit API - Multi-stage Dockerfile
# ============================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
# Install build tools for native dependencies
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app
# Create .npmrc to configure pnpm
RUN echo "shamefully-hoist=true" > .npmrc && \
    echo "node-linker=hoisted" >> .npmrc

# Dependencies stage
FROM base AS deps
COPY --from=base /app/.npmrc ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=base /app/.npmrc ./
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Generate Prisma and build API
WORKDIR /app/apps/api
RUN npx prisma generate
RUN pnpm build

# Production deps stage with pnpm
FROM base AS prod-deps
WORKDIR /app
COPY --from=base /app/.npmrc ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --prod

# Production stage
FROM node:20-alpine AS production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
# Install build tools for bcrypt compilation
RUN apk add --no-cache openssl python3 make g++

WORKDIR /app

# Copy production deps from pnpm
COPY --from=prod-deps /app/node_modules ./node_modules

# Rebuild bcrypt native module for this platform
RUN cd node_modules/bcrypt && npm rebuild

# Copy Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./

# Clean up build tools and set ownership
RUN apk del python3 make g++ && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main.js"]
