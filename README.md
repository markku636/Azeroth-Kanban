# Stock Deep Agent

台股 AI 機器人：股票資料層 + 技術分析 + Deep Agent / LLM 編排 + 背景 Job（BullMQ worker）+ 警報引擎 + LINE Bot 推播，建構於基本登入與 RBAC 骨架之上。

## 本地運行
1. docker compose up -d
2. 訪問 http://localhost:3010/

## 功能總覽
- **股票資料層**：watchlist、日 K 快取、買賣訊號、研究報告、背景 Job 執行記錄
- **技術分析 + Deep Agent**：worker 端跑指標計算與 **Claude** LLM 編排（單一 LLM 供應商，原 Gemini Vertex 已收斂移除），產出訊號與每日研究報告
- **進階投資策略指標**：趨勢動能（DMI/ADX、%R、CCI、OBV、BIAS、SAR、背離）、三大法人連買 streak、估值河流圖（PER/PBR/殖利率位階）、5 因子多策略可調權重評分（綜合 / 價值 / 動能 / 籌碼 / 存股）、10 策略選股器
- **警報引擎**：價格突破 / RSI 超買超賣 / 法人連買 / 估值便宜 / 背離 等條件，達標自動推播（當日去重）
- **LINE Bot**：webhook 接收訂閱 + 主動推播（訊號 / 警報）
- **後台 Console**：`/stock-bot/console` 模擬、手動觸發、排程管理
- **關注清單獨立頁**：`/stock-bot/watchlist` 排序 / 篩選 + 一鍵全部分析 / 研究 + KD 紅綠燈結論 + 目標 / 停損價到價提醒（複用 Alert 引擎，零 schema 異動）
- **RBAC 權限**：admin / user / viewer 三角色，Role-Permission 可在 UI 即時調整
- **i18n**：zh-TW / en 雙語，含 API 錯誤碼翻譯（`ApiErrorCode` 雙碼制）
- **稽核**：登入紀錄與操作紀錄頁可查
- **一鍵啟動**：`docker compose up -d` 同時起 postgres + admin（自動 migrate + seed）

> 模組設計細節見 [`docs/stock-bot-README.md`](./docs/stock-bot-README.md) 與 `docs/specs/` 各份 Spec。

## 技術選型

| 項目 | 選用 | 理由 |
| --- | --- | --- |
| 語言 | TypeScript 5.8（strict mode） | 全面型別安全 |
| 前端 | Next.js 16 App Router + React 19 | SSR + RSC，單一專案前後端 |
| 樣式 | Tailwind CSS 3 + RizzUI 1.0 | 快速刻 UI、設計一致性 |
| 深色模式 | next-themes | 系統偏好偵測 + 切換持久化 |
| 後端 | Next.js Route Handlers | 單一 runtime 維護 |
| 背景 Job | BullMQ worker（`worker/`） | 抓 K 線、技術分析、報告生成、警報檢查 |
| 資料庫 | PostgreSQL 16 | Docker 啟動即可 |
| ORM | Prisma 6 | 型別安全、migration / seed 內建 |
| 認證 | NextAuth v5 + bcryptjs | Credentials provider 主流程；保留 Keycloak provider 供未來擴充 |
| 表單 | react-hook-form + Zod | 受控表單 + schema 驗證 |
| 狀態管理 | Jotai | 原子化 store、低樣板 |
| 表格 | TanStack Table v8 + rc-table | 角色 / 稽核 / 登入紀錄列表 |
| Toast | react-hot-toast | 輕量、簡單 API |
| i18n | 自製 useTranslation hook + JSON 字典 | 支援巢狀 key + `{{var}}` 插值 |
| 部署 | Docker Compose（一鍵）+ Helm chart（K8s） | 本機與正式環境皆覆蓋 |

## 安裝與啟動

### A. 一鍵啟動（推薦）

需要 Docker Desktop。

```bash
docker compose up -d
docker compose logs admin -f      # 看到 [entrypoint] seed: ✅ success 即可
```

打開 http://localhost:3010 → 自動 redirect 到 `/login`。

容器啟動時會自動：
1. 等 postgres healthy
2. `prisma migrate deploy` 套用 schema
3. `prisma db seed` 建立角色 + 權限 + role-permission 矩陣 + 預設帳號（idempotent，多次啟動安全）
4. 啟動 Next.js

### B. 本機 dev

```bash
# 1. 起 postgres（docker）
docker compose up -d postgres

# 2. 安裝依賴
npm install

# 3. 建立 .env（複製 .env.example 修改）
cp .env.example .env
# 至少修改 AUTH_SECRET

# 4. 初始化 DB
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 5. 啟動 dev server（port 3010）
npm run dev
```

## 預設帳號

`prisma db seed` 會建立以下三個帳號（bcrypt 雜湊密碼）：

| Email | 密碼 | Role | 可做什麼 |
| --- | --- | --- | --- |
| `admin@example.com` | `Admin@1234` | admin | 全部權限（股票機器人 + 角色 / 權限 / 稽核管理） |
| `user@example.com` | `User@1234` | user | 管理關注股、檢視訊號 / 研究報告 |
| `viewer@example.com` | `Viewer@1234` | viewer | 檢視訊號 / 研究報告（唯讀） |

## 主要頁面

| 路徑 | 內容 |
| --- | --- |
| `/login` | 帳密登入頁 |
| `/` | 入口（登入後自動導向 `/stock-bot/console`） |
| `/stock-bot/console` | 股票機器人後台 console（K 線 / 模擬對話 / 關注 / 訊號 / 報告 / 警報） |
| `/stock-bot/watchlist` | 關注清單獨立頁（排序 / 篩選 / 一鍵全部分析研究 / KD 紅綠燈 / 目標停損價） |
| `/stock-bot/screener` | 選股器 / 飆股雷達（10 策略 + 可切評分策略） |
| `/stock-bot/market` | 大盤 / 類股 + 國際盤 + AI 盤勢報告 |
| `/stock-bot/monitor` | Worker / Job 監控、排程編輯、立即執行、執行紀錄（`STOCK_BOT_ADMIN`） |
| `/stock-bot/glossary`、`/stock-bot/about` | 名詞速查字典、資料來源說明 |
| `/me` | 個人資訊 |
| `/roles` | 角色管理 + Role-Permission 勾選 Modal（admin 限定） |
| `/user-roles` | 使用者-角色指派（admin 限定） |
| `/audit-logs` | 操作稽核紀錄（admin 限定） |
| `/login-records` | 登入紀錄（admin 限定） |

## 專案結構

```
├── common/                          # 共用型別（@azeroth/common）
│   └── src/
│       ├── api-response.ts          # ApiResult / ApiResponse
│       ├── api-error-code.ts        # 結構化錯誤碼字典
│       ├── stock-types.ts           # 股票相關共用型別
│       └── index.ts                 # barrel export
├── admin/                           # Next.js 16 後台
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── stock-bot/       # ← 股票機器人 console
│   │   │   │   ├── me/ roles/ user-roles/ audit-logs/ login-records/
│   │   │   └── api/v1/
│   │   │       ├── stock/           # ← 股票 API（watchlist / signals / alerts …）
│   │   │       ├── webhooks/        # ← LINE webhook
│   │   │       └── admin/           # users / roles / permissions / me / audit-logs / login-records
│   │   ├── auth.ts                  # NextAuth 設定
│   │   ├── middleware.ts            # 路由守衛（NextAuth）
│   │   ├── lib/
│   │   │   ├── stock-service.ts     # 股票三層 service
│   │   │   ├── stock-queue.ts       # BullMQ 佇列封裝
│   │   │   ├── line-reply.ts        # LINE 回覆 / 推播
│   │   │   ├── permission-service.ts
│   │   │   ├── audit-log-service.ts
│   │   │   ├── with-permission.ts   # API 權限裝飾器
│   │   │   └── prisma.ts
│   │   ├── components/ layouts/hydrogen/ hooks/ config/ locales/
│   │   ├── Dockerfile
│   │   └── entrypoint.sh            # 等 DB → migrate → seed → start Next.js
├── worker/                          # BullMQ worker（抓 K 線 / 分析 / 報告 / 警報）
├── prisma/
│   ├── schema.prisma                # Member / Role / Permission / 股票相關資料表
│   ├── migrations/                  # 已 checked in 的 migration SQL
│   └── seed.ts                      # roles + permissions + matrix + members
├── helm/                            # Kubernetes Helm chart
├── keycloak/                        # （optional）Keycloak realm export，預設不啟用
├── docs/                            # PRD / Plan / Spec / Bug / Log / Knowledge
├── .claude/                         # Claude Code commands / agents / hooks / rules / skills
└── docker-compose.yml
```

## 常用指令

```bash
# 開發
npm run dev                  # admin port 3010
docker compose up -d         # 一鍵啟動（postgres + admin）
docker compose logs admin -f
docker compose down -v       # 重置（會清掉 postgres data）

# Prisma
npm run prisma:generate
npm run prisma:migrate       # dev migrate
npm run prisma:seed
npm run prisma:reset         # 重置 + seed
npm run prisma:studio

# 品質
npm run type:check
npm run lint
npm run build
```

## 資安掃描（Snyk）

本專案使用 [Snyk](https://snyk.io) 做資安漏洞掃描，採**手動執行**模式（無 CI 整合）。

### 快速上手

```bash
npx -y snyk@latest auth        # 一次性，會開瀏覽器登入 / 貼 API token
npm run security:deps          # 跑第一次掃看結果
```

### 常用指令

```bash
npm run security:deps          # 掃 npm 依賴漏洞（high+critical）
npm run security:iac           # 掃 docker-compose.yml 設定風險（IaC）
npm run security:container     # 掃 base image CVE
npm run security:all           # 三類一起跑
npm run security:report        # 輸出 JSON 報告到 .tmp/snyk-report.json
```

### 何時該跑

- `npm install` 引入新套件後
- 升級套件版本後（特別是 framework：Next.js / Prisma / NextAuth）
- 上版前快速 check
- 收到 GitHub Dependabot alert 時交叉驗證

> 補充：`npm audit` 是 npm 內建工具，可作為 Snyk 的快速替代（無需 token、僅掃 npm 依賴）。

## 環境變數

完整清單見 `.env.example`。最常調整的：

| Key | 說明 |
| --- | --- |
| `DATABASE_URL` | postgres 連線字串 |
| `AUTH_SECRET` | NextAuth session 加密金鑰，至少 32 字（必須改） |
| `AUTH_ALLOW_CREDENTIALS` | 是否啟用 Credentials provider |
| `NEXT_PUBLIC_AUTH_KEYCLOAK_ENABLED` | 登入頁是否顯示 Keycloak 按鈕 |
| `SEED_ON_START` | docker entrypoint 是否每次啟動時跑 seed（upsert，安全） |
| `REDIS_URL` | BullMQ 佇列連線（worker） |
| `FINMIND_TOKEN` | FinMind 股票資料 API token（缺則降級為有限免費額度） |
| `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` | Claude LLM 認證（研究報告 / 問答 / 盤勢報告；缺則優雅降級為純資料型報告） |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | LINE Bot 憑證 |

## AI 協作紀錄

本專案採「Write-doc-before-Code」流程，PRD / Plan / Spec / Bug / Log / Knowledge 完整保存於 [`docs/`](./docs/) 目錄。
