---
name: Monorepo Workspace 切分（prisma / common / admin）
description: 三層 workspace 的職責邊界、依賴方向（prisma → common → admin），與 Prisma schema 為何留在 monorepo root
type: architecture
---

# Monorepo Workspace 切分（prisma / common / admin）

> 建立日期: 2026-04-25
> 分類: architecture
> 來源 Spec: 多個（系統骨架 + 各 feature spec）
> 來源 Bug: 無

---

## 背景

本專案採 npm workspaces，宣告於 root [`package.json`](../../../package.json) — `workspaces: ["common", "admin"]`。Prisma schema 與 `prisma/seed.ts` **故意不放進任一 workspace**，而是留在 monorepo root。新增 feature 時，開發順序固定為 `prisma → common → admin`，這個順序不是慣例而是**型別與 schema 依賴方向**決定的硬性順序。

## 知識內容

### 三層職責邊界

```
┌──────────────────────────────────────────────┐
│  admin/  (Next.js 15 App Router)             │
│  ├─ app/         pages, API routes           │
│  ├─ lib/         service 層 (kanban, auth…)  │
│  ├─ auth.ts      NextAuth v5 設定            │
│  └─ middleware   路由守衛                     │
│  依賴：@iqt/common + @prisma/client (root)   │
└────────────┬─────────────────────────────────┘
             │ import { ApiResult, ApiResponse, ApiErrorCode }
             ▼
┌──────────────────────────────────────────────┐
│  common/  (純 TS，框架無關)                   │
│  ├─ api-response.ts    ApiResult / ApiResponse│
│  └─ api-error-code.ts  ApiErrorCode (i18n key)│
│  零執行期相依，build 後輸出 d.ts + js         │
└────────────┬─────────────────────────────────┘
             │ (無)
             ▼
┌──────────────────────────────────────────────┐
│  prisma/  (root，非 workspace)               │
│  ├─ schema.prisma   6 + 1 張表的 SoT        │
│  └─ seed.ts                                   │
│  產出：@prisma/client → 兩端共用             │
└──────────────────────────────────────────────┘
```

### 依賴方向（嚴格單向）

| 上層 | 可以匯入 | **不可以**匯入 |
| --- | --- | --- |
| `admin/` | `@iqt/common`、`@prisma/client`、Next.js 生態 | — |
| `common/` | （Node.js 標準庫） | `admin/*`、`@prisma/client`、`next/*` |
| `prisma/` 檔案 | `@prisma/client`、Node 標準庫 | `admin/*`、`common/*` |

`common/` 維持框架無關的鐵律，是為了讓未來若拆出第二個前端／NestJS API 也能直接複用 `ApiResult`、`ApiErrorCode` 字典。一旦 `common` 拉進 `next/*` 或 `prisma/client`，這條退路就斷了。

### 為何 Prisma schema 留在 root，而非塞進 admin/

- **Single Source of Truth**：未來若新增第二個服務（例如獨立的 worker、NestJS API），它們會共用同一份 schema。把 schema 綁死在 `admin/` 等於選擇性繼承。
- **`@prisma/client` 是 root 的 dependency**：`prisma generate` 從 root 跑、輸出到 root `node_modules`，兩個 workspace 都能 hoist。
- **seed 與 migration 跨 workspace**：`prisma/seed.ts` 寫入的是 Member / Role / Permission，這些是業務全域資料，不該屬於某個 workspace 的私產。

### 開發順序為什麼是 `prisma → common → admin`

順序不是流程偏好，是**型別依賴**決定的：

1. **prisma 先**：改完 `schema.prisma` 必須跑 `npm run prisma:generate`，否則 `@prisma/client` 的 TS 型別還是舊的。Service 層（`admin/src/lib/`）大量 import `@prisma/client` 型別（`KanbanCard`, `Prisma.TransactionClient`），順序顛倒會看到誤導性的 TS 錯誤。
2. **common 次之**：若新功能需要新增 `ApiErrorCode.{group}.{leaf}` 條目，必須先加 `common/src/api-error-code.ts` 並 `npm run build --workspace=common`，否則 admin import 會失敗。Root `npm run dev` 已自動先 build common。
3. **admin 最後**：API route 與 service 層此時才能同時拿到 prisma 型別、ApiResult/ApiErrorCode、Next.js runtime。

### 路徑別名

定義於 admin 的 `tsconfig.json` paths：

| Alias | 對應 |
| --- | --- |
| `@/*` | `admin/src/*` |
| `@iqt/common` | monorepo root 的 `common/dist`（build 產出，不是 src） |

⚠️ `@iqt/common` 解析的是 `dist/`，不是 `src/`。這代表**改了 common 後若沒 build，admin 端 import 到的還是舊版**。`npm run dev` 已在 root 把 `npm run build --workspace=common` 串在 `dev` script 之前；如果只跑 `npm run dev --workspace=admin` 會踩到這個坑。

### 各 workspace 獨立的 build / lint / type:check

```jsonc
// root package.json
"scripts": {
  "build":      "npm run build --workspaces --if-present",
  "lint":       "npm run lint --workspaces --if-present",
  "type:check": "npm run type:check --workspaces --if-present"
}
```

每個 workspace 自有對應 script。CI / pre-commit 跑 root 的版本即會 fan-out 到所有 workspace。新增 workspace 時，記得補對應 script，否則會被 `--if-present` 靜默跳過。

## 適用場景

- 規劃新功能：先確認本次是否需要動 schema → 順序排定
- 拆分共用模組時：判斷該放 `common/`（框架無關）還是 `admin/lib/`（綁 Next.js / Prisma）的依據
- 新增第三個 workspace（例如 `worker/`、`api/`）時的依賴對齊參考

## 注意事項

- **不要在 `common/` 引入 `@prisma/client`**：即使是型別。Prisma client 是執行期套件，會把 common 變成 Node-only 模組。如果需要在 common 描述卡片型別，自行寫獨立的 `interface CardDto`（admin 端再從 `@prisma/client` 投影過來），而非 `import type { KanbanCard } from '@prisma/client'`。
- **`@iqt/common` import 到 `dist/`**：改 common 後務必 `npm run build --workspace=common`；用 root `npm run dev` 才會自動串接。
- **Root 沒有 `src/`**：root 只放 monorepo 共用設定（`package.json`、`tsconfig` base、`docker-compose.yml`、`prisma/`、`docs/`、`.claude/`）。任何業務邏輯都該歸某個 workspace。
- **新增 workspace 時必補 root scripts**：`build` / `lint` / `type:check` / `format` 都靠 `--workspaces --if-present` fan-out，沒有對應 script 會靜默跳過，CI 不會抱怨。

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-04-25: 初次建立，從目前系統架構提煉
-->
