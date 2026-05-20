---
description: 對 Selkie 事故管理功能跑端對端 QA 驗收,產出帶截圖的 Markdown 報告
---

# /qa-selkie

對 Selkie 事故管理功能執行端對端 QA 驗收。

**用法**

```
/qa-selkie            # 完整跑 T1–T4
/qa-selkie smoke      # 只跑 T1(登入 + 事故列表)
/qa-selkie tier=2,3   # 只跑指定 tier
```

**前置條件**

- 應用須已在 `http://localhost:3010` 執行(`docker compose up -d`,等 60–90 秒)。
- `.mcp.json` 已配置 chrome-devtools MCP。

**執行方式**

呼叫 `qa-selkie` subagent(定義於 `.claude/agents/qa-selkie.md`),它會:

1. 探活 `http://localhost:3010`;連不上則寫「服務未啟動」報告後結束。
2. 讀 PRD `docs/requirements/completed/20260519-001-selkie-incident-agent.md` 的 AC。
3. 用 chrome-devtools MCP 開瀏覽器,依 Tier 逐條跑 AC。
4. 產出報告至 `.tmp/qa-reports/{YYYYMMDD-HHmm}/report.md`(含截圖)。

> 注意:Selkie triage(T3 AC 4.4)需 GCP Vertex AI 憑證;未設定時 triage 會 FAILED,
> 屬預期行為(驗 AC 4.5 失敗顯示),不算測試失敗。

參數:`$ARGUMENTS`
