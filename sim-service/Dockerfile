# ─── 模擬微服務 sim-service —— 獨立的 Next.js app ───

# Stage 1: 安裝依賴
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# Stage 2: 建置
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: 執行(Next.js standalone)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
