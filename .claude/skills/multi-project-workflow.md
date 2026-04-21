# Skill: 多專案協作工作流

## 專案架構

本專案為 npm workspaces monorepo，共 3 個邏輯單位（`prisma` 非 workspace，但獨立管理）：

| 子專案 | 角色 | 技術棧 |
| --- | --- | --- |
| `prisma/` | 資料庫 Schema 與 migration 來源 | Prisma 6 + PostgreSQL 16 |
| `common/` | 共用型別套件（`@iqt/common`）— 目前僅 `ApiResponse` / `ApiResult` | TypeScript 5.8 |
| `admin/` | Next.js 15 後台（登入、RBAC、稽核、Kanban 功能將在此實作） | Next.js 15 + React 19 + NextAuth v5 + RizzUI |

## 跨專案依賴關係

依賴方向為單向：`prisma` → `common` → `admin`

- **Schema 變更起手**：任何資料表/欄位調整都從 `prisma/schema.prisma` 開始，執行 `prisma:migrate` 後由 `@prisma/client` 自動產生型別
- **型別共用**：`common/` 只放真正會跨專案共用的純型別（如 ApiResult），不放業務邏輯
- **Admin 單一消費者**：目前唯一消費 Prisma Client 與 `@iqt/common` 的端點是 `admin/`（未來若新增 `job/`、`public-web/` 同樣適用此順序）

## 開發順序（固定）

```
1. prisma (schema / migration / seed)
   ↓
2. common (shared types — 僅必要時)
   ↓
3. admin (API routes → components → pages)
```

Admin 內部再細分：
```
admin/src/app/api/v1/**  (API 路由與 withPermission 裝飾器)
  ↓
admin/src/lib/**         (service 層、業務邏輯)
  ↓
admin/src/components/**  (UI 元件)
  ↓
admin/src/app/admin/**   (頁面)
```

---

## Skill 1: 新增功能（全端聯動）

**觸發**: 使用者要求新增功能、API 或頁面
**步驟**:
1. **查閱知識庫** → 依序掃描 `docs/knowledge/architecture/`、`patterns/`、`domain/`、`integrations/`，找出相關知識納入規劃；有 DB 相關知識則帶入資料表異動區塊
2. **自動建立 Plan** → 若使用者提供了參考資料（`references/`），先用 Read tool 讀取所有檔案（PDF/MD/SQL 等），再依據內容建立 `docs/plans/doing/{YYYYMMDD}-{NNN}-{feature}/plan.md`；無參考資料時建立單檔 `docs/plans/doing/{YYYYMMDD}-{NNN}-{feature}.md`。展示摘要等確認
3. 使用者確認 Plan 後 → **自動拆解為 Spec(s)** → Write `docs/specs/doing/{YYYYMMDD}-{NNN}-{task}.spec.md`
4. 使用者確認 Spec 後 → **自動寫入開發日誌** → 追加到 `docs/logs/{YYYYMMDD}-{NNN}-{topic}.md`
5. 確認是否需要新資料表（→ 先處理 `prisma/`，執行 `npm run prisma:migrate`）
6. 在 `common/` 新增共用型別（僅必要時）
7. 在 `admin/` 新增 Service / API Route（`src/lib/*` + `src/app/api/v1/**`），套用 `withPermission` 裝飾器
8. 在 `admin/` 新增 UI 元件與頁面（`src/components/**` + `src/app/admin/**`）
9. 開發中遇 Bug → **自動記入 Spec Bug Log**；有通用價值 → **自動建立** `docs/bugs/doing/{YYYYMMDD}-{NNN}-{bug}.md`
10. 完成後 → **自動歸檔** Spec 至 `completed/`（由 SessionEnd Hook 處理），更新 Plan 狀態，追加 Log 完成記錄
11. **知識提煉** → AI 檢視開發過程，判斷是否有可複用知識 → 有則建立/更新 `docs/knowledge/{category}/`

## Skill 2: 新增資料表（資料庫起手）

**觸發**: 使用者要求新增或修改資料表
**步驟**:
1. **查閱知識庫** → 掃描 `docs/knowledge/architecture/` 與 `patterns/`，找出 DB 相關踩坑記錄
2. **自動建立 Spec** → Write `docs/specs/doing/{YYYYMMDD}-{NNN}-{task}.spec.md`，必須填寫「資料表異動」區塊（含欄位明細、型別、約束、索引、migration 注意事項）
3. 使用者確認 Spec 後 → **自動寫入開發日誌**
4. 修改 `prisma/schema.prisma`，遵循 `snake_case` 欄位 + `@map()` 映射至 camelCase TypeScript 屬性
5. 執行 `npm run prisma:migrate --name {feature_name}` 產生 migration
6. 若影響既有資料 → 在 migration 檔補資料遷移 SQL
7. 在 `admin/src/lib/` 新增 service，在 `admin/src/app/api/v1/**` 新增對應 API
8. 視需求在 `admin/src/app/admin/**` 新增管理介面
9. 完成後 → **自動歸檔** Spec，追加 Log 完成記錄
10. **知識提煉** → AI 判斷是否有架構/模式知識值得提煉
**注意**: migration rollback 步驟在 Spec 的「回滾計劃」區塊明確記錄

## Skill 3: 修復 Bug

**觸發**: 使用者回報 Bug
**步驟**:
1. **查閱知識庫** → 掃描 `docs/knowledge/` 找出相關踩坑經驗與已知解法
2. 分析根本原因（先讀 code，不直接改）
3. 判斷影響範圍（是否跨子專案）
4. **自動建立 Spec** → Write `docs/specs/doing/{YYYYMMDD}-{NNN}-fix-{bug}.spec.md`
5. 使用者確認後修復 → **自動寫入開發日誌**
6. 修復完成 → **自動記入 Spec Bug Log**
7. 若 Bug 有通用價值 → **自動建立** `docs/bugs/doing/{YYYYMMDD}-{NNN}-{bug}.md`
8. 完成後 → **自動歸檔** Spec，追加 Log 完成記錄
9. **知識提煉** → Bug 有通用解法或踩坑經驗 → 提煉至 `docs/knowledge/{category}/`

## Skill 4: 重構

**觸發**: 使用者要求重構模組或改善品質
**步驟**:
1. **查閱知識庫** → 掃描 `docs/knowledge/` 找出相關架構知識與模式慣例
2. 分析問題點
3. 評估影響範圍（grep 所有引用點，尤其 `admin/` → `@iqt/common` → `@prisma/client` 的調用鏈）
4. **自動建立 Plan** → Write `docs/plans/doing/{YYYYMMDD}-{NNN}-refactor-{module}.md`
5. 使用者確認 Plan 後 → **自動拆解為 Spec(s)**
6. 使用者確認 Spec 後 → **自動寫入開發日誌**
7. 逐步執行，不改變外部行為
8. 完成後 → **自動歸檔** Spec/Plan，追加 Log 完成記錄
9. **知識提煉** → 重構過程中發現的架構洞察、模式改進 → 提煉至 `docs/knowledge/{category}/`
**注意**: Spec 需列出不變性約束（例如：API 回應格式不變、既有 DB 欄位語意不變）

## Skill 5: 更新文件與指引

**觸發**: 新增了 command、功能、或改了架構
**步驟**:
1. 更新 `CLAUDE.md`
2. 更新 `.claude/skills/` 對應技能文件
3. 更新 `.claude/commands/` 對應指令（如有）
4. 更新 `README.md`
5. 格式跟現有慣例一致
**注意**: 文件檔屬豁免範圍，不需建 Plan/Spec

---

## 常見任務 Prompt 範例

### 新增 Kanban 卡片功能

```
我要實作 Kanban 卡片 CRUD：
- 欄位：id / title / description / status(待處理|進行中|待驗收|已完成) / sortOrder
- 預設 status = 待處理
- 拖拉時後端更新 status 與 sortOrder

請依 Write-doc-before-Code 流程建立 Plan，等我確認再拆 Spec。
```

### 修復登入失敗 Bug

```
我登入時會失敗（密碼正確但卻回 401）。
請依流程：分析根因 → 建 Spec → 確認後修復 → 記入 Bug Log。
```
