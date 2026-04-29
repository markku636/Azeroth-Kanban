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

# 產生 Prisma Client（寫到根 /app/node_modules/@prisma/client）
RUN npx prisma generate --schema ./prisma/schema.prisma

# Build-time dummy 環境變數
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV AUTH_SECRET="build-time-dummy-secret-not-used-at-runtime"
ENV NEXTAUTH_URL="http://localhost:3000"

# Build @azeroth/common shared package
RUN npm run build --workspace=common

RUN npm run build --workspace=admin

# ─── Stage 3: Production runner ───
FROM node:20-alpine AS runner
WORKDIR /app

# busybox-extras 提供 nc 指令；entrypoint 用它等待 postgres
RUN apk add --no-cache libc6-compat busybox-extras

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Next.js standalone output（先複製，標準 Next.js 部署模式）
COPY --from=builder --chown=nextjs:nodejs /app/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/admin/.next/static     ./admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/admin/public           ./admin/public

# Prisma schema 與 migrations
COPY --from=builder /app/prisma ./prisma

# 將 builder 完整的 node_modules 覆蓋上去
# 原因：prisma CLI（用於 entrypoint 的 migrate / seed）有大量傳遞依賴（@prisma/config, effect, 等），
# 一個一個 cherry-pick 易漏；直接整包覆蓋最穩定。Demo 用量可接受多出的 image 大小。
# 注意：必須在 standalone COPY 之後執行，否則 standalone 的 server.js 會覆蓋這些檔案。
COPY --from=builder /app/node_modules ./node_modules

# Entrypoint script
COPY --from=builder --chown=nextjs:nodejs /app/admin/entrypoint.sh ./admin/entrypoint.sh
RUN chmod +x ./admin/entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "/app/admin/entrypoint.sh"]
