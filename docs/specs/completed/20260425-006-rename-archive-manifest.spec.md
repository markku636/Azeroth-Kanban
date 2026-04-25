# 改名 archive-manifest → last-session-archive

> 建立日期: 2026-04-25
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

把 `docs/.archive-manifest.json` 改名為 `docs/.last-session-archive.json`，同步更新兩個 SessionEnd Hook 與 `.gitignore`，讓檔名與實際行為（每次 Session 整檔覆寫、僅保存本次歸檔工作單）一致。

## 背景

使用者發現 `completed/` 資料夾裡有 8 個歸檔檔案，但 `.archive-manifest.json` 只有 3 筆。檢查後確認流程沒壞 —— manifest 是給 `session-end-knowledge.mjs` 用的「本次工作單」、每次 SessionEnd 整檔覆寫。問題是檔名容易讓人誤會成「歷史總帳」。歷史紀錄已經由 `git log docs/specs/completed/` 提供，不需要再維護累積式 JSON。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | — |
| `common` | ❌ | — |
| `admin` | ❌ | — |

> 本次純屬專案根目錄的 hook / 設定改動，不涉及任何子專案程式碼。

---

## 受影響檔案

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `.claude/hooks/session-end-archive.mjs` | 修改 | manifestPath 字串 + 檔頭註解 |
| `.claude/hooks/session-end-knowledge.mjs` | 修改 | manifestPath 字串 + 檔頭註解 |
| `.gitignore` | 修改 | 第 39-40 行同步改名 |
| `docs/.archive-manifest.json` → `docs/.last-session-archive.json` | 改名 | 既有檔案實體改名，避免殘留 |

---

## 邏輯變更點

行為**完全不變**，純命名整理：
- 兩個 hook 寫入/讀取的路徑常數從 `.archive-manifest.json` 改成 `.last-session-archive.json`
- 檔頭註解補上「每次覆寫、非累積歷史」的提醒
- `.gitignore` 同步更新

## 預期測試結果

- [ ] 下次 SessionEnd 觸發 `session-end-archive.mjs`，可寫入 `docs/.last-session-archive.json`
- [ ] `session-end-knowledge.mjs` 能讀到新檔名並完成知識提煉
- [ ] `git status` 不顯示 `docs/.last-session-archive.json`（被 .gitignore 忽略）

## 風險評估

- 無功能變更，純字串重命名
- 兩個 hook 必須同步改，否則 archive 寫入新檔名但 knowledge 讀舊檔名 → knowledge 提煉會被跳過

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者問「.archive-manifest.json 怎麼歷史歸檔少了這麼多」→ 釐清是命名誤導不是流程壞掉 → 採用方案 2（改名，最小改動）。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 維持現狀，不動 | ❌ 棄用 | 命名誤導源頭沒解決，下次還會被誤會 |
| 改成累積式歷史 | ❌ 棄用 | `git log completed/` 已是完整歷史；維護累積 JSON 等於存兩份 + 要寫去重邏輯避免重複提煉 |
| 改名 `last-session-archive.json` | ✅ 採納 | 名實相符，10 行內可完成，零行為風險 |

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/.claude/hooks/session-end-archive.mjs` — Edit @ 2026-04-25 09:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/.claude/hooks/session-end-knowledge.mjs` — Edit @ 2026-04-25 09:23
