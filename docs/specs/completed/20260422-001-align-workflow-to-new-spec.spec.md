# Align Write-doc-before-Code workflow to new spec

> 建立日期: 2026-04-22
> 狀態: ✅ 已完成
> 關聯計劃書: `C:\Users\a4756\.claude\plans\write-doc-before-code-idempotent-curry.md`（Claude plan mode 產出，非本 repo 內 `docs/plans/`）

---

## 目標

把現有 Write-doc-before-Code 工作流配置全面對齊使用者提供的最新目標規格：新增 PRD 模組、擴充 Plan 大型必填章節、加入 DB 異動硬性告知規則、分層豁免條件、Hook 歸檔範圍納入 requirements/。

## 背景

使用者提供完整目標規格，指示「衝突以新規格為準、刪除重覆或不需要的」。本任務為純配置 / 文件 / Hook 邏輯對齊，不涉及應用層程式碼（admin/common/prisma 等）。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ❌ | 無 |

（本次變更全部位於專案根層級的 `.claude/` 與 `docs/`，不影響任何子專案。）

## 建議開發順序

1. 新增 PRD 模組檔案（無依賴）
2. 更新 Templates（`docs/plans/_plan-template.md`、`docs/specs/_spec-template.md`）
3. 更新規則 / 指引（`CLAUDE.md`、`.claude/rules/spec-before-code.md`、`.claude/skills/multi-project-workflow.md`、`.claude/commands/create-spec.md`、`.claude/commands/_spec-convention.md`）
4. 更新 Hooks（`.claude/hooks/session-end-archive.mjs`、`.claude/hooks/session-start-brief.mjs`）
5. 驗證

---

## 受影響檔案

### 新增

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `docs/requirements/_prd-template.md` | 新增 | PRD 11 章節模板 |
| `docs/requirements/README.md` | 新增 | PRD 用途、生命週期說明 |
| `docs/requirements/doing/.gitkeep` | 新增 | 保留空資料夾 |
| `docs/requirements/completed/.gitkeep` | 新增 | 保留空資料夾 |

### 修改（文件類）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `CLAUDE.md` | 修改 | 加 PRD 章節、DB 告知規則、豁免分層 |
| `.claude/rules/spec-before-code.md` | 修改 | 加 Step 0.1 / 1.1 / 1.2、豁免分 5.1 / 5.2 |
| `.claude/skills/multi-project-workflow.md` | 修改 | Skill 1 加 PRD 前置步驟 |
| `.claude/commands/create-spec.md` | 修改 | Phase 1 加 PRD 檢查 |
| `.claude/commands/_spec-convention.md` | 修改 | 加交叉引用註解 |
| `docs/plans/_plan-template.md` | 修改 | 重寫，移除 references，加系統分析/架構/角色權限/WBS |
| `docs/specs/_spec-template.md` | 修改 | 微調文案對齊 |

### 修改（Hooks）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `.claude/hooks/session-end-archive.mjs` | 修改 | ARCHIVE_DIRS 加 requirements/doing→completed |
| `.claude/hooks/session-start-brief.mjs` | 修改 | 掃描清單加 requirements/doing，前綴 `[PRD]`、含 🟡 狀態 |

---

## 邏輯變更點

### `.claude/hooks/session-end-archive.mjs`

- 在 `ARCHIVE_DIRS` 陣列最前新增：`{ doing: "docs/requirements/doing", completed: "docs/requirements/completed", type: "requirement" }`（PRD 先歸檔，因為 Plan 可能引用它）
- 其餘邏輯不變

### `.claude/hooks/session-start-brief.mjs`

- 在掃描清單加入 `{ label: "PRD", dir: "docs/requirements/doing" }`
- 狀態偵測的正則表達式加入 `🟡`（討論中）

### 文件 / Templates

- 章節增刪、文字調整，無邏輯變更

## 資料表異動

<!-- 無資料庫變更 -->

（本任務純文件配置對齊，無任何資料表 / 欄位變更。）

## API 合約（若有 API 異動）

<!-- 無 API 變更 -->

## 回滾計劃

1. `git status` 確認本 Spec 涉及的 11 個修改檔案與 4 個新增檔案
2. 如需回滾：`git checkout HEAD -- <file>` 還原修改；`rm -rf docs/requirements/` 移除新增模組
3. 回滾後重啟 Claude Code session 讓 hooks 重新載入

## 預期測試結果

- [ ] `docs/requirements/{doing,completed}/` 目錄存在
- [ ] `_prd-template.md` 含目標規格列出的 11 章節
- [ ] `_plan-template.md` 含「系統分析、系統架構、角色與權限、WBS、資料表異動」五大可選區塊
- [ ] `.claude/rules/spec-before-code.md` 含 Step 0.1 / 1.1 / 1.2 與分層豁免
- [ ] `CLAUDE.md` 含「資料庫異動告知規則（硬性）」段落
- [ ] 手動建立 🟡 PRD 於 `docs/requirements/doing/` → 執行 `node .claude/hooks/session-start-brief.mjs` → 輸出應含 `[PRD] 🟡`
- [ ] 手動建立 ✅ PRD 於 `docs/requirements/doing/` → 執行 `node .claude/hooks/session-end-archive.mjs` → 檔案移至 `completed/`、manifest 含 `type: "requirement"`

## 風險評估

- Hook 邏輯改動小但需實測，避免語法錯誤破壞 SessionStart / SessionEnd
- `_plan-template.md` 大幅重寫，但 `docs/plans/{doing,completed}/` 當前皆空，無相容性風險
- 規則文件變長，依賴 AI 自律遵守 DB 告知規則（目標規格接受的設計）

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

### Bug #1: session-end-archive.mjs 與 session-start-brief.mjs 狀態偵測過於寬鬆

| 分類 | 內容 |
| --- | --- |
| **[Bug]** | 兩個 hook 用 `content.includes` 判斷文件是否已完成，但 Spec 內文若有敘述性完成標記（例如 AI 協作紀錄中的「採納」欄、「PRD 確認才能建 Plan」等說明）會被誤判為完成並搬移至 `completed/`。端到端測試時本 Spec 本身被誤歸檔。 |
| **[Root Cause]** | 狀態偵測未限定只讀「狀態列」，而是整檔全文搜尋。模板中的 `> 狀態: 🔵 開發中 / 已完成` 未必位於檔案開頭，正文又大量出現描述性 emoji。 |
| **[Solution]** | 兩個 hook 統一改為正則匹配 `^\s*>\s*(?:\*\*)?\s*狀態\s*(?:\*\*)?\s*:\s*(.+)$`，只讀取第一筆狀態列；若同時含 🔵/🟡/❓ 視為模板或進行中，不歸檔；只有狀態列**僅含**完成標記時才搬檔。`extractStatus` 同樣改為只看狀態列，優先順位：🔵 → 🟡 → 完成。 |
| **[Prevention]** | 所有 hook 對 Markdown 文件的狀態判斷，應透過「明確欄位」讀取，避免全文關鍵字掃描。模板需保留 `> 狀態:` 或 `> **狀態**:` 固定前綴，方便正則匹配。 |

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者要求對齊 Write-doc-before-Code 工作流至最新目標規格，衝突以新規格優先；使用者補充指示：「相關的 hook 也要改」「不需要的重覆的就幫我移掉」。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 新增 PRD 模組 | 採納 | 目標規格核心新增物 |
| Plan 恆為單檔 | 採納 | 目標規格明令；session-end-archive.mjs 與 session-start-brief.mjs 的資料夾 `plan.md` 分支邏輯同步移除 |
| 規則文件副檔名清單刪 `.mjs/.cjs`，Hook 保留 | 採納 | 規則求簡潔、Hook 求完整保護；在規則文件加註說明差異 |
| 用 Hook 偵測 DB 變更 | 棄用 | 偵測會誤判；改用規則硬性規範（CLAUDE.md + spec-before-code.md Step 1.2 雙重宣示） |
| 清理 settings.json permissions | 採納（超出原計劃） | 使用者指示「不需要的重覆的就幫我移掉」；`Bash(*)` 已涵蓋 `Bash(git ...:*)`，`mcp__*` 已涵蓋 `mcp__chrome-devtools__*` 子項，移除 6 個重覆項 |
| 修復 archive/brief hook 狀態偵測 bug | 採納（超出原計劃） | 端到端測試時觸發：內文敘述性完成標記造成誤歸檔。順勢修復並記入 Bug Log |

### 產出摘要

**新增（4）**：
- `docs/requirements/_prd-template.md` — 11 章節 PRD 模板（產品概述、目標/非目標、US+AC、NFR、開放問題、變更紀錄等）
- `docs/requirements/README.md` — PRD 用途、啟動條件、生命週期
- `docs/requirements/{doing,completed}/.gitkeep`

**修改（11）**：
- `CLAUDE.md` — 規模判斷表加「Plan 建議章節」欄、加 PRD 前置判斷段、加 DB 告知硬性規則段、加豁免兩層
- `.claude/rules/spec-before-code.md` — Step 0.1 / 1.1 / 1.2、豁免分 5.1 / 5.2、副檔名清單移除 .mjs/.cjs 並加註 Hook 差異
- `.claude/skills/multi-project-workflow.md` — Skill 1 加 PRD 前置與 DB 告知步驟
- `.claude/commands/create-spec.md` — Phase 1 加 PRD 前置檢查
- `.claude/commands/_spec-convention.md` — 豁免清單交叉引用
- `docs/plans/_plan-template.md` — 重寫：移除「參考資料」、加入「關聯 PRD」「系統分析」「系統架構（Mermaid）」「角色與權限」「WBS」
- `docs/README.md` — 結構表加 `requirements/`、模板清單加 `_prd-template.md`
- `.claude/hooks/session-end-archive.mjs` — ARCHIVE_DIRS 加 requirements/ 最前、移除資料夾 plan.md 分支、狀態偵測改為只讀狀態列
- `.claude/hooks/session-start-brief.mjs` — 掃描清單加 PRD、支援 🟡、移除資料夾 plan.md 分支、狀態偵測改為只讀狀態列
- `.claude/settings.json` — 移除 6 個 permission 重覆項（Bash git 子集、mcp chrome 子項）
- `.claude/settings.local.json` — 同上清理

**驗證**：端到端 hook 測試通過（見 README 未改，但實測結果：PRD 🟡 → 不歸檔、PRD ✅ → 只搬 PRD、Spec 🔵 → 保留 doing/，狀態偵測只看狀態列不被內文影響）。
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/.claude/hooks/session-end-archive.mjs` — Write @ 2026-04-22 13:09
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/.claude/hooks/session-start-brief.mjs` — Write @ 2026-04-22 13:10
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/.claude/hooks/session-end-archive.mjs` — Edit @ 2026-04-22 15:15
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/.claude/hooks/session-start-brief.mjs` — Edit @ 2026-04-22 15:15
