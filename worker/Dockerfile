# ═══════════════════════════════════════════════════════
#  Stock Worker — Monorepo-aware build（以 tsx 直跑 TS，免編譯）
#  Build context: monorepo root（docker-compose context: .）
#  Node 22：滿足 @napi-rs/canvas musl 預編譯與後續 @line/bot-sdk v11
# ═══════════════════════════════════════════════════════

# ─── Stage 1: 安裝相依 ───
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY common/package.json ./common/
COPY admin/package.json  ./admin/
COPY worker/package.json ./worker/

RUN npm ci

# ─── Stage 2: 執行環境 ───
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules/
# worker 因 zod 版本差異有 nested deps（claude-agent-sdk / deepagents / langchain…），
# .dockerignore 排除了 */node_modules，故從 deps stage 補回 worker 的 nested node_modules
COPY --from=deps /app/worker/node_modules ./worker/node_modules
COPY package.json ./
COPY common/ ./common/
COPY worker/ ./worker/
COPY prisma/ ./prisma/

# 產生 Prisma Client + 編譯 common（worker 透過 @azeroth/common 引用）
RUN npx prisma generate --schema ./prisma/schema.prisma \
 && npm run build --workspace=common

# 以 tsx 直接執行 worker 入口（用 worker 的 start script，cwd=worker/）
CMD ["npm", "run", "start", "--workspace=worker"]
