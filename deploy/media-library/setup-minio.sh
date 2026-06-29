#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# 媒體庫 MinIO 一次性設定：建立 bucket + 專屬 user + bucket-scoped 私密 policy。
#
# 私密模式（與 app 一致）：bucket 不開匿名讀，app 用 presigned URL 存取。
# 冪等：重複執行安全（已存在的略過 / 重綁 policy）。
#
# 需求：本機已裝 `mc`（MinIO Client），且有 MinIO 「admin」憑證。
# 在「能連到 MinIO」的機器上執行（你說 k8s 碰不到，但只要能 curl 到
# https://minio.markkulab.net 就能跑這支；不需 kubectl）。
#
# 用法：
#   export MINIO_ROOT_USER=<minio admin key>
#   export MINIO_ROOT_PASSWORD=<minio admin secret>
#   export S3_SECRET_KEY=<為媒體庫 app 設一組強密碼>   # 之後填進 .env / k8s secret
#   sh setup-minio.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

ALIAS="${MC_ALIAS:-m}"
MINIO_URL="${MINIO_URL:-https://minio.markkulab.net}"
BUCKET="${S3_BUCKET:-studio-media}"
APP_USER="${S3_ACCESS_KEY:-studio-media-app}"
POLICY_NAME="studio-media-rw"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

: "${MINIO_ROOT_USER:?請先 export MINIO_ROOT_USER=<minio admin key>}"
: "${MINIO_ROOT_PASSWORD:?請先 export MINIO_ROOT_PASSWORD=<minio admin secret>}"
: "${S3_SECRET_KEY:?請先 export S3_SECRET_KEY=<為 app 設一組強密碼>}"

echo "[setup] 連線 MinIO：$MINIO_URL（bucket=$BUCKET, user=$APP_USER, private）"
mc alias set "$ALIAS" "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# 1) bucket（已存在則略過）
mc mb --ignore-existing "$ALIAS/$BUCKET"

# 私密：明確收回任何匿名讀（即使先前誤設過 download 也清掉）
mc anonymous set none "$ALIAS/$BUCKET" || true

# 2) 專屬 policy（只綁此 bucket）。新版 mc 用 `policy create`，舊版用 `policy add`。
mc admin policy create "$ALIAS" "$POLICY_NAME" "$SCRIPT_DIR/studio-media-policy.json" 2>/dev/null \
  || mc admin policy add "$ALIAS" "$POLICY_NAME" "$SCRIPT_DIR/studio-media-policy.json"

# 3) 專屬 user（已存在則略過錯誤）+ 綁 policy
mc admin user add "$ALIAS" "$APP_USER" "$S3_SECRET_KEY" 2>/dev/null || true
mc admin policy attach "$ALIAS" "$POLICY_NAME" --user "$APP_USER" 2>/dev/null \
  || mc admin policy set "$ALIAS" "$POLICY_NAME" user="$APP_USER"

echo ""
echo "✅ 完成。bucket=$BUCKET（private）、user=$APP_USER 已綁 $POLICY_NAME。"
echo "   把以下兩行填進 root .env（或 k8s secret），重啟 admin 即生效："
echo "     S3_ACCESS_KEY=$APP_USER"
echo "     S3_SECRET_KEY=<你剛 export 的 S3_SECRET_KEY 值>"
