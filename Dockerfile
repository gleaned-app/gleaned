# syntax=docker/dockerfile:1

# ── 1. Install dependencies ───────────────────────────────────────────────────
# Build stages are pinned to --platform=$BUILDPLATFORM so they always run on the
# host architecture (no QEMU emulation). The Next.js static export contains only
# platform-independent files (HTML, CSS, JS, images), so we build it once and
# copy the result into every target platform's runtime image. This guarantees
# byte-identical chunk hashes across amd64 and arm64 manifests — a multi-arch
# build that ran `pnpm build` per platform could otherwise produce diverging
# hashes (Turbopack threading races, QEMU non-determinism), with the result
# that the deployed HTML references chunks that only exist in the other
# platform's image → 404 for every static asset on mismatched servers.
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# ── 2. Build static export (once, on host architecture) ──────────────────────
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build
# output: "export" writes to out/ — purely static, platform-independent files.

# ── 3. Serve with nginx (per-target-platform) ────────────────────────────────
# This is the only stage that varies by target platform, and it only contains
# nginx itself — the application bytes are identical on every architecture.
FROM nginx:1.31.1-alpine3.23 AS runner
COPY --from=builder /app/out /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx-entrypoint.sh /docker-entrypoint.d/50-gleaned-config.sh
RUN chmod +x /docker-entrypoint.d/50-gleaned-config.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
