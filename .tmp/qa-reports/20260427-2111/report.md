# Kanban QA Acceptance Report

- **執行時間**：2026-04-27 21:11 +08:00
- **範圍**：smoke (T1)
- **應用 URL**：http://localhost:3010
- **PRD 版本**：v0.4 (docs/requirements/completed/20260423-001-kanban-board.md)
- **使用帳號**：admin@example.com / Admin@1234
- **NEXT_PUBLIC_AUTH_KEYCLOAK_ENABLED**：false

## Summary

| Tier | 主題 | Total | Pass | Fail | Skip |
|---|---|---|---|---|---|
| T1 | Smoke | 4 | 4 | 0 | 0 |
| **Total** | | **4** | **4** | **0** | **0** |

**結論**：4 / 4 Pass；所有 T1 Smoke AC 全部通過

---

## T1 — Smoke


### AC 6.1 未登入存取 /kanban 應導向 /login

- **結果**：Pass
- **步驟**：
  1. 登出 (`/api/auth/signout`)
  2. `navigate_page http://localhost:3010/kanban`
- **斷言**：當前 URL = `http://localhost:3010/login?callbackUrl=%2Fkanban` (含 `/login?callbackUrl=`)
- **實際 URL**：`http://localhost:3010/login?callbackUrl=%2Fkanban`
- **截圖**：`screenshots/T1-AC6.1-redirect.png`


### AC 6.2 登入頁顯示正確認證介面並可登入

- **結果**：Pass
- **Flag 偵測**：`NEXT_PUBLIC_AUTH_KEYCLOAK_ENABLED=false`（來自 `admin/.env`）
- **驗證路徑**：flag=false → 驗 Credentials 帳密表單路徑
- **步驟**：
  1. 觀察 `/login` 頁快照：顯示帳密表單（email textbox + password textbox + 「登入」button），**無**「以 Keycloak 登入」按鈕
  2. `fill_form` email=admin@example.com / password=Admin@1234
  3. `click` 「登入」
  4. 等待重導 `/kanban`
- **斷言**：
  - 登入頁含帳密輸入欄位（credentials form 存在）
  - 登入後 URL = `http://localhost:3010/kanban`
- **截圖 (登入頁)**：`screenshots/T1-AC6.2-login.png`
- **截圖 (登入後)**：`screenshots/T1-AC6.2-after-login.png`


### AC 2.1 視覺化劃分四個獨立欄位

- **結果**：Pass
- **步驟**：
  1. 登入後在 `/kanban` 頁取得 `h2` 標籤清單
  2. 確認 emoji 存在
- **斷言**：
  - 4 個 h2 欄位標題：待處理、進行中、待驗收、已完成
  - 4 個欄位 emoji 全部存在：📋、🚀、👀、✅
  - Header 區無品牌 Logo（`header` 內無 `<img>` — Spec 002 合規）
- **API 旁證**：`/api/v1/kanban/cards` 回傳 `{ TODO, IN_PROGRESS, IN_REVIEW, DONE }` 四組欄位
- **截圖**：`screenshots/T1-AC2.1-kanban-board.png`

### AC 2.2 每張卡片必須且只能歸屬於四個狀態之一

- **結果**：Pass
- **步驟**：
  1. 呼叫 `/api/v1/kanban/cards` API
  2. 驗證所有卡片的 `status` 值
- **斷言**：
  - 共 5 張卡片（TODO: 2, IN_PROGRESS: 2, IN_REVIEW: 1, DONE: 0）
  - 所有卡片 `status` 均為有效值（TODO / IN_PROGRESS / IN_REVIEW / DONE）
  - 無卡片同時存在於多個欄位
- **截圖**：`screenshots/T1-AC2.1-kanban-board.png`（同上）


---

## 附錄：環境資訊

- Node.js 版本：服務已啟動，http://localhost:3010 HTTP 200
- 資料庫：5 張既有 KanbanCard（TODO×2, IN_PROGRESS×2, IN_REVIEW×1, DONE×0）
- Keycloak：NEXT_PUBLIC_AUTH_KEYCLOAK_ENABLED=false（已用 Credentials 路徑驗收）

