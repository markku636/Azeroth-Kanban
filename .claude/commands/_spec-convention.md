# 技術規格文件（Spec）撰寫慣例

所有超過 3 行的程式碼改動，在開始寫程式碼之前，必須先建立技術規格文件。

---

## 強制性規則

1. **超過 3 行的改動 = 必須建立 Spec**
2. **Spec 必須經使用者確認後才能開始寫程式碼**
3. **開發過程中遇到 Bug，必須記錄在 Spec 的 Bug Log 區塊**
4. **開發完成後，Spec 標記 ✅ 已完成，由 SessionEnd Hook 自動從 `doing/` 歸檔到 `completed/`**
5. **跨子專案改動（`prisma` / `common` / `admin`），必須列出所有受影響的子專案與開發順序**

### 豁免清單

不需建 Spec：修正 typo、更新版本號、修改設定值、純格式化調整、≤ 3 行小幅調整、設定檔（`.json`, `.yaml` 等）/ 文件檔（`.md`）、使用者明確說「直接改 / hotfix」

> 完整豁免規則見 [`.claude/rules/spec-before-code.md`](../rules/spec-before-code.md) 第五節（含「豁免 PRD」與「豁免 Plan/Spec」兩層）。

---

## 檔案規範

- **位置**: `docs/specs/doing/{YYYYMMDD}-{NNN}-{task-name}.spec.md`
- **命名**: `{YYYYMMDD}-{NNN}-{name}.spec.md`，日期 + 流水號 + kebab-case 描述（如 `20260421-001-add-kanban-card-crud.spec.md`）
- **模板**: `docs/specs/_spec-template.md`

---

## 生命週期

1. 建立 Spec → `doing/`（🔵 開發中）
2. 使用者確認後開始開發
3. 依 Spec 逐步實作
4. 遇問題寫入 Bug Log
5. 標記 ✅ 已完成 → SessionEnd Hook 自動歸檔至 `completed/`

---

## Bug Log 格式

### Bug #{序號}: {問題簡述}

| 分類 | 內容 |
| --- | --- |
| **[Bug]** | {問題描述} |
| **[Root Cause]** | {根本原因} |
| **[Solution]** | {解決方案} |
| **[Prevention]** | {預防措施} |

通用 Bug 另存 `docs/bugs/`。
