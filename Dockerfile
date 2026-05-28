# syntax=docker/dockerfile:1
#
# Two-stage dependency strategy to support multi-arch builds:
#
#  builder — runs on $BUILDPLATFORM (host) for speed.
#             Uses --ignore-scripts so native N-API modules are not compiled.
#             next build only produces JS; it never executes native modules.
#
#  deps    — runs on the target platform.
#             Compiles better-sqlite3 and argon2 for the correct architecture.
#             Prebuilt binaries are downloaded when available (amd64, arm64);
#             python3/make/g++ are the fallback for unsupported platforms.
#
#  runner  — combines .next/ from builder + node_modules from deps.

# ── 1. Build Next.js (host architecture — JS output is platform-independent) ──
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── 2. Install production dependencies (target platform for native modules) ───
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# ── 3. Runtime image ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 nextjs

# node_modules from the target-platform deps stage (correct native binaries).
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Next.js build output and static assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Runtime config, migration artefacts, and Drizzle config.
# drizzle-kit migrate reads from lib/db/migrations/ — schema files are not needed.
COPY --chown=nextjs:nodejs package.json ./
COPY --chown=nextjs:nodejs drizzle.config.ts ./
COPY --chown=nextjs:nodejs lib/db/migrations ./lib/db/migrations

# /data is mounted as a named Docker volume; gleaned.db lives here.
# chown here sets the default owner for the empty mountpoint directory;
# Docker overlays the named volume on top at container start.
RUN mkdir -p /data && chown nextjs:nodejs /data

# Enable corepack as root so pnpm symlinks land in /usr/local/bin (requires root).
RUN corepack enable pnpm

USER nextjs
EXPOSE 3000

# prestart script runs `drizzle-kit migrate` before `next start`.
CMD ["pnpm", "start"]
