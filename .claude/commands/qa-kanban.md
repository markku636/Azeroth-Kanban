---
description: 啟動 qa-kanban subagent，用 chrome-devtools MCP 對 Kanban 看板跑端對端驗收
argument-hint: "[all | smoke | tier=N,M | AC X.Y]"
---

# /qa-kanban — Kanban 看板端對端 QA 驗收

呼叫 `qa-kanban` subagent 對 Kanban 看板跑驗收測試，依 PRD `docs/requirements/doing/20260423-001-kanban-board.md` 的 AC 逐條驗證，產出帶截圖的 Markdown 報告。

> **本指令屬於文件 / 測試自動化，不受 `spec-before-code.md` 攔截**。

## 參數

| 參數 | 行為 |
|---|---|
| 無 | 等同 `all` — 跑全部 7 個 tier |
| `all` | 跑 T1 → T7 全部（約 10–15 分鐘） |
| `smoke` | 只跑 T1（登入 + 看板顯示），約 1 分鐘 |
| `tier=N,M` | 跑指定 tier，例：`tier=1,3,5` |
| `AC X.Y` | 跑單條 AC（除錯用），例：`AC 4.3` |

## Tier 對照

| Tier | 主題 | 涵蓋 PRD AC |
|---|---|---|
| T1 | Smoke：登入 + 看板顯示 | US-6 AC 6.1–6.2、US-2 AC 2.1–2.2 |
| T2 | 卡片 CRUD | US-1、US-3、US-5（inline 新增、編輯 Modal、垃圾桶刪除） |
| T3 | 拖拉 | US-4 AC 4.1–4.7（跨欄、同欄、optimistic UI、KeyboardSensor） |
| T4 | RBAC + ownership 隔離 | PRD § 3.2、AC 6.3（admin/user/viewer + 跨使用者隔離） |
| T5 | 輸入驗證 + errorCode 翻譯 | AC 1.2 / AC 3.x / AC 10.5（KANBAN_* 雙碼制） |
| T6 | i18n 多語系 | US-10 AC 10.1–10.5（zh-TW ↔ en、reload 後保留） |
| T7 | RWD 響應式 | US-7 AC 7.1–7.5（1280 / 768 / 375 三斷點截圖） |

## 前置條件

- 應用必須**已在 `http://localhost:3010` 跑**（`docker compose up -d` + 等 60–90 秒，或 `cd admin && npm run dev`）
- chrome-devtools MCP 已配置（見 `.mcp.json`）
- subagent 連不到服務會立即寫一份「服務未啟動」報告後結束

## 執行流程

請用 `Agent` 工具呼叫 `qa-kanban` subagent，將 `$ARGUMENTS` 完整傳入作為任務參數。subagent 會：

1. **Pre-flight check** — `curl -sf http://localhost:3010/login` 探活
2. **Read PRD** — 從 `docs/requirements/doing/20260423-001-kanban-board.md` 擷取 AC 清單
3. **Setup output dir** — `mkdir -p .tmp/qa-reports/{YYYYMMDD-HHmm}/screenshots`
4. **Run scenarios** — 依參數過濾的 tier 順序跑，每個 AC 跑完即增量追加到 `report.md`
5. **Aggregate** — 在報告開頭補 Summary table（Pass / Fail / Skip 計數）
6. **Cleanup** — 關掉 chrome-devtools 開過的 page，回主對話 ≤200 字 summary

## 產出位置

- 報告：`.tmp/qa-reports/{YYYYMMDD-HHmm}/report.md`
- 截圖：`.tmp/qa-reports/{YYYYMMDD-HHmm}/screenshots/T{n}-{ac}-{step}.png`
- 失敗證據截圖檔名以 `-FAIL` 結尾，方便快速定位

> `.tmp/` 已加入 `.gitignore`，不會污染 git 工作樹。

## 範例

```
/qa-kanban smoke              # 1 分鐘快驗
/qa-kanban all                # 完整跑（約 10–15 分鐘）
/qa-kanban tier=2,3           # 只驗 CRUD 與拖拉
/qa-kanban AC 4.3             # 只驗單一 AC
```

## 限制

- subagent **不會**修改任何 `admin/`、`prisma/`、`common/` 下的程式碼（工具白名單限制）
- subagent **不會**自動啟動 / 關閉 docker；服務必須先跑起來
- 若 chrome-devtools MCP 的某個工具（drag / take_snapshot / resize_page 等）尚未在 user-level 授權，第一次呼叫會跳授權提示，請手動允許
