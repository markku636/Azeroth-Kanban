#!/bin/sh
# Admin container 啟動 script：等待 DB → migrate → seed → 啟動 Next.js
#
# 環境變數：
#   POSTGRES_HOST       postgres 主機名稱（預設 postgres）
#   POSTGRES_PORT       postgres port（預設 5432）
#   SEED_ON_START       是否在啟動時跑 seed（預設 true，因為 seed.ts 是 upsert，多次執行安全）
#                       若已建好預設帳號 / 不想再覆寫顯示名稱，可設為 false
set -e

PG_HOST="${POSTGRES_HOST:-postgres}"
PG_PORT="${POSTGRES_PORT:-5432}"
SEED_ON_START="${SEED_ON_START:-true}"

echo "──────────────────────────────────────────────"
echo "[entrypoint] waiting for postgres ($PG_HOST:$PG_PORT)..."
echo "──────────────────────────────────────────────"
until nc -z "$PG_HOST" "$PG_PORT"; do
  sleep 1
done
echo "[entrypoint] postgres ready"

echo "──────────────────────────────────────────────"
echo "[entrypoint] running prisma migrate deploy..."
echo "──────────────────────────────────────────────"
# 直接用 node 呼叫 prisma CLI 入口，繞過 .bin/ 的 symlink 解析問題
# （Docker COPY 單檔 symlink 會 dereference，導致 wasm 找不到）
node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma

if [ "$SEED_ON_START" = "true" ]; then
  echo "──────────────────────────────────────────────"
  echo "[entrypoint] running prisma db seed (idempotent, upsert-based)..."
  echo "──────────────────────────────────────────────"
  # 不用 set -e 包覆 seed：seed 失敗（例如 schema 對不上、bcrypt 套件缺失）需要被看到，
  # 但仍允許容器啟動 Next.js（避免 admin 因 seed 故障完全無法登入排查）。
  if node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts; then
    echo "[entrypoint] seed: ✅ success"
  else
    echo "[entrypoint] seed: ❌ FAILED (exit=$?). Container will continue, but DB may lack default rows."
    echo "[entrypoint]   排查方式：docker compose logs admin | grep '\[seed\]'"
  fi
else
  echo "[entrypoint] seed: skipped (SEED_ON_START=$SEED_ON_START)"
fi

echo "──────────────────────────────────────────────"
echo "[entrypoint] starting Next.js..."
echo "──────────────────────────────────────────────"
exec node admin/server.js
