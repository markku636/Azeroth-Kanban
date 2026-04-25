# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---- Stage 2: Build (if needed) ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# RUN npm run build  # 若有建置步驟請取消註解

# ---- Stage 3: Production ----
FROM node:20-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

# 建立非 root 使用者
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 從 deps 階段複製生產依賴
COPY --from=deps /app/node_modules ./node_modules

# 從 build 階段複製應用程式原始碼
COPY --from=build /app .

# 移除不必要的檔案
RUN rm -rf .git .github .gitlab tests test coverage .env* \
    && chown -R appuser:appgroup /app

# 切換至非 root 使用者
USER appuser

EXPOSE 3000

# 健康檢查：每 30 秒探測一次，逾時 5 秒，連續 3 次失敗判定為 unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })" || exit 1

CMD ["node", "index.js"]