# Spec: 將 npm scope `@iqt/*` 重新命名為 `@azeroth/*`

> 建立日期: 2026-04-25
> 狀態: ✅ 已完成
> 規模: 中型（純 rename，無邏輯異動）

---

## 目標

把 monorepo 內所有 `@iqt/*` package scope 與其 import / docs / build 設定一併改名為 `@azeroth/*`，與專案代號 Azeroth Kanban 對齊。純機械式 find-replace，不涉及任何業務邏輯異動。

## 背景

`@iqt` 為原業務系統留下的 namespace，與目前 Kanban 面試作業專案命名不一致。使用者要求換掉。

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 不涉及 |
| `common` | ✅ | `package.json` name |
| `admin` | ✅ | `package.json` name + dependency + 3 個 import |
| 部署層 | ✅ | `Dockerfile` 註解 |
| 文件 | ✅ | README / CLAUDE / .claude / docs/knowledge / docs/specs |

## 受影響檔案

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/package.json` | 修改 | `name: @iqt/common` → `@azeroth/common` |
| `admin/package.json` | 修改 | `name: @iqt/admin` → `@azeroth/admin`；`dependencies['@iqt/common']` → `@azeroth/common` |
| `admin/src/lib/api-client.ts` | 修改 | import path |
| `admin/src/lib/api-response.ts` | 修改 | import path + JSDoc 註解 |
| `admin/src/lib/kanban-service.ts` | 修改 | import path |
| `admin/Dockerfile` | 修改 | 註解 |
| `.gitignore` | 修改 | 註解 |
| `README.md` | 修改 | 文件 |
| `CLAUDE.md` | 修改 | 文件 |
| `.claude/rules/coding-standards.md` | 修改 | 文件 |
| `.claude/skills/multi-project-workflow.md` | 修改 | 文件 |
| `docs/knowledge/INDEX.md` | 修改 | 文件 |
| `docs/knowledge/architecture/20260425-001-monorepo-workspace-layout.md` | 修改 | 文件 |
| `docs/specs/completed/20260425-001-keycloak-auth-and-deployment.spec.md` | 修改 | 文件 |

## 邏輯變更點

無。純文字替換 `@iqt/` → `@azeroth/`。

## 後續動作

- 執行 `npm install` 讓 `package-lock.json` 重新生成 / 同步新名稱
- 執行 `npm run build --workspace=common` 確認 build 仍成功
- 執行 `npm run type:check` 全 workspace 通過

## 預期測試結果

- [ ] `npm run type:check` ✅ 全 workspace 通過
- [ ] `npm run build` ✅ admin 與 common 編譯成功
- [ ] `grep -r "@iqt" --exclude-dir=node_modules` 應為 0 筆（package-lock.json 由 npm install 自動更新）

## AI 協作紀錄

### 目標確認

使用者要求把 `@iqt` namespace 全面改為 `@azeroth/*`（呼應 Azeroth Kanban 專案代號）。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| namespace 改 `@azeroth/*` | ✅ 採納 | 與專案代號一致 |
| 是否手動編輯 package-lock.json | ❌ 不做 | 由 `npm install` 自動同步即可 |

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/api-client.ts` — Edit @ 2026-04-25 10:16
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/api-response.ts` — Edit @ 2026-04-25 10:16
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/kanban-service.ts` — Edit @ 2026-04-25 10:16
