# ═══════════════════════════════════════════════════════
#  Admin (Next.js) — Monorepo-aware Multi-stage Build
#  Build context: monorepo root ( docker-compose context: . )
# ═══════════════════════════════════════════════════════

# ─── Stage 1: Build ───
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 先複製 package.json + lockfile，讓 npm ci 這層可被 Docker layer 快取
COPY package.json package-lock.json ./
COPY common/package.json ./common/
COPY selkie/package.json ./selkie/
COPY admin/package.json  ./admin/

# npm ci 直接在 builder 內執行：
# selkie(zod@4 + deepagents/langchain)與 admin(zod@3)版本衝突，npm 會把部分
# 套件「巢狀」安裝到 selkie/node_modules。若沿用獨立 deps stage 只 COPY root
# node_modules，巢狀套件會遺漏，導致 selkie 的 tsc 找不到 deepagents 等模組。
RUN npm ci

# 複製原始碼（node_modules 已由 .dockerignore 排除，不會覆蓋上面安裝的）
COPY common/ ./common/
COPY selkie/ ./selkie/
COPY admin/  ./admin/
COPY prisma/ ./prisma/

# 產生 Prisma Client（寫到 /app/node_modules/@prisma/client）
RUN npx prisma generate --schema ./prisma/schema.prisma

# Build-time dummy 環境變數
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV AUTH_SECRET="build-time-dummy-secret-not-used-at-runtime"
ENV NEXTAUTH_URL="http://localhost:3000"

# 依序 build：common → selkie（admin 依賴的 workspace）→ admin
RUN npm run build --workspace=common
RUN npm run build --workspace=selkie
RUN npm run build --workspace=admin

# ─── Stage 2: Production runner ───
FROM node:20-alpine AS runner
WORKDIR /app

# busybox-extras 提供 nc 指令；entrypoint 用它等待 postgres
RUN apk add --no-cache libc6-compat busybox-extras

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Next.js standalone output（標準 Next.js 部署模式）
COPY --from=builder --chown=nextjs:nodejs /app/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/admin/.next/static     ./admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/admin/public           ./admin/public

# Prisma schema 與 migrations
COPY --from=builder /app/prisma ./prisma

# Selkie workspace（含其巢狀 node_modules — serverExternalPackages 執行時經
# node_modules/@azeroth/selkie 符號連結載入）
COPY --from=builder /app/selkie ./selkie

# 將 builder 完整的 root node_modules 覆蓋上去
# 原因：prisma CLI（entrypoint 的 migrate / seed）與 @azeroth/selkie 等執行期需要。
# 注意：必須在 standalone COPY 之後執行，否則 standalone 的 server.js 會被覆蓋。
COPY --from=builder /app/node_modules ./node_modules

# Entrypoint script
COPY --from=builder --chown=nextjs:nodejs /app/admin/entrypoint.sh ./admin/entrypoint.sh
# 去除可能的 CRLF：Windows 上 git checkout 可能把 .sh 轉成 CRLF，容器內 sh 會報
# "set: illegal option -"。sed 去掉行尾 \r 後再 chmod。
RUN sed -i 's/\r$//' ./admin/entrypoint.sh && chmod +x ./admin/entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "/app/admin/entrypoint.sh"]
