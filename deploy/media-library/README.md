# 媒體庫部署設定（Media Library / MinIO S3）

媒體庫把檔案存到 MinIO（S3 相容物件儲存）。**私密模式**：bucket 不開匿名讀，
app 用後端即時簽的 presigned URL（1h）讀取，存取受登入 + RBAC + owner 把關。

| 項目 | 值 |
| --- | --- |
| Bucket | `studio-media`（私密，**不**開 anonymous download） |
| 對外位址 | `https://minio.markkulab.net`（presigned 簽章用，須瀏覽器可達） |
| App 專屬帳號 | `studio-media-app`（policy 只綁此 bucket，勿用 minioadmin） |
| App 讀的 env | `S3_ENDPOINT` / `S3_PUBLIC_URL` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` |

> 程式碼面已全部就緒（`lib/media-storage.ts`、`lib/media-service.ts`、`api/v1/media/*`、
> `/media` 頁、Prisma `Media` model、`media.*` 權限、compose/`.env.example` 的 `S3_*`）。
> 這個資料夾只剩「外部資源 + 注入 secret」這一段，需要在**能連到 MinIO** 的機器上做。

本資料夾檔案：
- `setup-minio.sh` — 一次性建 bucket + 專屬 user + 私密 policy（跑 `mc`，需 MinIO admin 憑證）
- `studio-media-policy.json` — 只綁 `studio-media` 的讀寫 policy
- `minio-helm-values-snippet.yaml` — GitOps 固化片段（併進 deploy repo 的 MinIO chart values）
- `k8s-admin-s3.example.yaml` — 若 app 跑 k8s 用的 Secret + Deployment env 範例

---

## Path A — docker-compose（這個 app 目前的跑法，主要路徑）

1. **建 bucket + 專屬帳號**（在能連到 MinIO 的機器，需 `mc` 與 MinIO admin 憑證）：
   ```sh
   cd deploy/media-library
   export MINIO_ROOT_USER=<minio admin key>
   export MINIO_ROOT_PASSWORD=<minio admin secret>
   export S3_SECRET_KEY=<為 app 設一組強密碼>     # 之後填進 .env
   sh setup-minio.sh
   ```
   > 沒有 `mc` 也可改用 MinIO Console（minio-console.markkulab.net）：建 `studio-media`
   > bucket（Access Policy 維持 **private**）→ 建 user `studio-media-app` → 建 policy
   > 貼上 `studio-media-policy.json` 內容 → 把 policy 綁給該 user。

2. **填 root `.env`**（與 `docker-compose.yml` 同層；`compose` 會插值）：
   ```dotenv
   S3_ENDPOINT=https://minio.markkulab.net
   S3_PUBLIC_URL=https://minio.markkulab.net
   S3_REGION=us-east-1
   S3_BUCKET=studio-media
   S3_ACCESS_KEY=studio-media-app
   S3_SECRET_KEY=<步驟 1 設的強密碼>
   ```
   （`.env.example` 已含這組註解；compose admin 服務的 `S3_*` 已接好。）

3. **重建並上線**：
   ```sh
   docker compose build admin
   docker compose up -d
   ```
   entrypoint 會 `prisma db push`（建 `media_library` 表）＋ seed（補 `media.*` 權限）。

---

## Path B — k8s（若 app 改跑在 cluster；目前不是）

1. 用 `setup-minio.sh` 或 `minio-helm-values-snippet.yaml` 把 bucket/user/policy 準備好。
2. `kubectl apply -f k8s-admin-s3.example.yaml`（先把 `<namespace>` 與 `S3_SECRET_KEY` 換成真值）。
3. 把該檔下半段的 `env` / `envFrom` 併進 admin Deployment，rollout 重啟。

## GitOps 固化（避免 MinIO chart 重建後 bucket 消失）

把 `minio-helm-values-snippet.yaml` 的 `buckets:`（與選用的 `policies:`/`users:`）併進
deploy repo 的 `storage/minio/values.yaml`，再走「佈署管理」同步。私密 → bucket **不**給
`policy: download`。

---

## 驗證（上線後）

1. 以 `user@example.com` 登入 → 左側選單出現「媒體庫」；無 `media.view` 的角色看不到。
2. 在 `/media` 上傳一張圖、一段影片、一個音檔 → 網格縮圖/播放正常（presigned 生效）。
3. 換另一帳號登入 → 看不到別人的檔案（owner 隔離）；具 `media.view_all` 的 admin 看得到全部。
4. 預覽的「下載」鈕 → 以原始（含中文）檔名下載。
5. 刪一筆 → 網格移除、`mc ls m/studio-media` 該物件消失、稽核 log 有 `Media/delete`。
6. **私密性**：未認證直連 `https://minio.markkulab.net/studio-media/<key>` 應被拒（403 / AccessDenied）。

## Rollback

- 功能下架：admin env 移除 `S3_*` 後上傳會失敗，但不影響其他功能；或在 RBAC 收回 `media.*`
  讓選單/路由 403。
- 資料：刪 bucket 物件用 `mc rm --recursive --force m/studio-media`；DB 表 `media_library`
  可留（空表無害）。

## 安全備註

- bucket 全程**私密**，只有帶簽章/憑證能讀；別對 `studio-media` 設 anonymous download。
- 用**專屬** `studio-media-app`（policy 只綁此 bucket），不要把 minioadmin 主憑證放進 app env。
- `S3_SECRET_KEY` 勿提交進 git（root `.env` 已 gitignored；k8s 用 Secret/existingSecret）。
