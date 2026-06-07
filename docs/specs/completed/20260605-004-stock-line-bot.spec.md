# 股票 AI 機器人 — LINE Bot（webhook + 推播）

> 建立日期: 2026-06-05
> 狀態: ✅ 已完成
> 關聯計劃書: C:\Users\a4756\.claude\plans\ai-frolicking-fairy.md
> 前置 Spec: 20260605-001/002/003

## 目標

串接 LINE Bot（計劃 Phase 7 後半）：
1. admin webhook：驗簽 → 解析事件 → 共用 `runCommand` 指令路由 → reply。
2. worker LINE 推播：`line-push` 佇列 consumer + Flex 卡 / 文字推播 helper。
3. LineSubscriber 自動 upsert。

## 受影響檔案

### admin
| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/api/v1/webhooks/line/route.ts` | 新增 | LINE webhook（crypto 驗簽 + runCommand + reply） |
| `admin/src/lib/line-reply.ts` | 新增 | reply API 呼叫 helper |

### worker
| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/line/client.ts` | 新增 | LINE client 設定 |
| `worker/src/line/push.ts` | 新增 | 推播 helper + Flex 股票卡 builder |
| `worker/src/jobs/linePush.ts` | 新增 | line-push 佇列 consumer |
| `worker/src/jobs/workers.ts` | 修改 | 註冊 line-push worker |

## 邏輯變更點
- webhook：先 `await request.text()` 取原始 body → HMAC-SHA256 比對 `x-line-signature` → 解析 events → 文字訊息呼叫 `runCommand`（/watch 需綁定 member，否則提示）→ reply。
- worker push：`@line/bot-sdk` messagingApi pushMessage；Flex 卡含代號/訊號/信心。
- line-push consumer：收 `{ to, messages }` 推播。

## 風險
- LINE v11 需 Node ≥22（本機 v24、容器 node:22）。
- 圖片訊息需 HTTPS 公開 URL（PUBLIC_ASSET_BASE_URL）。
- 缺 channel 設定時推播 helper 直接略過（不崩潰）。

## 實際變更
<!-- PostToolUse Hook 自動追加 -->
## Bug Log
