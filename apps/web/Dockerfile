# ============================================
# Kokpit Web - Multi-stage Dockerfile
# ============================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Configure pnpm for hoisted dependencies
RUN echo "shamefully-hoist=true" > .npmrc && \
    echo "node-linker=hoisted" >> .npmrc

# Dependencies stage
FROM base AS deps
COPY --from=base /app/.npmrc ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=base /app/.npmrc ./
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build Next.js application
WORKDIR /app/apps/web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Production stage
FROM node:20-alpine AS production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy public assets
COPY --from=builder /app/apps/web/public ./public

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Copy static assets to correct location
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Manually install next dependency for production (hoisted)
RUN npm install --omit=dev next react react-dom

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "apps/web/server.js"]
