# 股票 AI 機器人 — 使用與 E2E 指南

台股 AI 分析機器人，建在 Azeroth-Kanban monorepo 之上。Deep Agent（`deepagents`）+ Gemini Vertex（看圖）+ Claude CLI（推理），BullMQ 佇列排程，LINE Bot + 後台 console。

> ⚠️ 所有訊號/報告僅供資訊參考，非投資建議。

## 架構
- `common/` — 共用型別（`stock-types.ts`）與 `STOCK` 錯誤碼。
- `worker/` — 常駐進程：資料層（FinMind/TWSE）、TA（指標/型態/訊號/出圖）、Deep Agent、BullMQ workers + scheduler、LINE 推播。
- `admin/` — Next.js：stock API、後台 console（`/admin/stock-bot/console`）、LINE webhook。
- `prisma/` — Watchlist / StockDailyPrice / AnalysisSignal / ResearchReport / AnalysisRun / LineSubscriber。

## 設定（`.env`，依 `.env.example`）
| 變數 | 說明 | 缺少時 |
| --- | --- | --- |
| `DATABASE_URL` `REDIS_HOST/PORT` | DB / 佇列 | 必要 |
| `FINMIND_TOKEN` | 台股資料（免費 600/hr） | 無 token 仍可 300/hr |
| `GOOGLE_SERVICE_ACCOUNT_KEY` `GCP_PROJECT_ID` | Gemini Vertex（看圖+主模型） | 研究報告降級為資料摘要版 |
| `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN` | Claude 推理 | 撰稿/解讀略過 |
| `LINE_CHANNEL_SECRET` `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot | webhook/推播略過 |

> 🔴 Vertex 金鑰一律走 `GOOGLE_SERVICE_ACCOUNT_KEY` 環境變數（`.env.local`，已 gitignore），切勿寫進程式碼或貼進對話。先前外洩的金鑰請輪替。

## 啟動（E2E）
```bash
# 1. 起 Postgres + Redis + admin + worker
docker compose up -d postgres redis
docker compose up -d        # 含 admin、worker（首次會 build）

# 或本機開發：
npm install
npm run build --workspace=common
npx prisma migrate deploy --schema ./prisma/schema.prisma   # 套用 migration（含 stock 資料表）
npx prisma db seed                                          # 建權限/角色/帳號
npm run dev --workspace=admin       # http://localhost:3011
npm run dev --workspace=worker      # 常駐 worker（workers + scheduler）
```
預設帳號：`admin@example.com` / `Admin@1234`。

## 驗收
1. 登入 admin → `/admin/stock-bot/console`。
2. 對話框輸入 `/watch 2330`、`/signal 2330`、`/report 2330`、`/gainers`。
3. 「關注清單」加入 2330 → 按「分析」「研究」→ 觀察「最新訊號」「研究報告」更新（worker 消化 BullMQ job）。
4. `analysis` job 純資料+TA，**無需任何金鑰**即可端到端產出買賣訊號（FinMind 免 token 可抓）。
5. LINE：用 ngrok 對 `https://<ngrok>/api/v1/webhooks/line` 設 webhook → 傳訊測試。

## 排程
worker 啟動即註冊：平日 14:00（Asia/Taipei，台股盤後）對 watchlist 每檔入列 analysis+research，並跑漲幅摘要（`upsertJobScheduler`）。

## 降級設計
缺 LLM/LINE 金鑰時各功能優雅降級（不崩潰）：研究報告 → 資料摘要版；Claude 解讀 → 略過；LINE 推播 → 略過。`analysis`（訊號）全程不需 LLM。

## 待辦 / 後續
- 強訊號自動推播給 LINE 訂閱者（line-push 佇列已就緒，待接 watchlist→subscriber 對應）。
- Gemini 看圖的 K 線圖以 HTTPS 對外（`PUBLIC_ASSET_BASE_URL`）供 LINE 圖片訊息。
- P1 功能：警報引擎、籌碼面、新聞情緒、paper trading、自然語言問答（見計劃）。
