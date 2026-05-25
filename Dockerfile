# syntax=docker/dockerfile:1

# ── 1. Install dependencies ───────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# ── 2. Build static export ────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build
# output: "export" writes to out/

# ── 3. Serve with nginx ───────────────────────────────────────────────────────
FROM nginx:1.31.1-alpine3.23 AS runner
COPY --from=builder /app/out /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx-entrypoint.sh /docker-entrypoint.d/50-gleaned-config.sh
RUN chmod +x /docker-entrypoint.d/50-gleaned-config.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
