# ═══════════════════════════════════════════════════════
#  Admin (Next.js) — Monorepo-aware Multi-stage Build
#  Build context: monorepo root ( docker-compose context: . )
# ═══════════════════════════════════════════════════════

# ─── Stage 1: Install dependencies ───
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY common/package.json ./common/
COPY admin/package.json  ./admin/

RUN npm ci

# ─── Stage 2: Build ───
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules/

COPY package.json ./
COPY common/ ./common/
COPY admin/  ./admin/
COPY prisma/ ./prisma/

# 產生 Prisma Client
RUN npx prisma generate --schema ./prisma/schema.prisma

# Build-time dummy 環境變數
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV AUTH_SECRET="build-time-dummy-secret-not-used-at-runtime"
ENV NEXTAUTH_URL="http://localhost:3000"

# Build @iqt/common shared package
RUN npm run build --workspace=common

RUN npm run build --workspace=admin

# ─── Stage 3: Production runner ───
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/admin/.next/static     ./admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/admin/public           ./admin/public

# Prisma schema + generated client
COPY --from=builder /app/prisma               ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "admin/server.js"]
