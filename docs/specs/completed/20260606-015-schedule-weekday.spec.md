# 股票機器人 — 排程加入「星期 / 每天」設定

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無（中型，延伸自 20260606-011-schedule-edit）

## 目標

排程編輯器除了時:分，新增**星期選擇**（可自選週一~週日，或每天），讓使用者能把目前固定「平日(一~五)」的排程改成任意星期或每天執行。

## 背景

現行 `updateSchedule` 寫死 `{分} {時} * * 1-5`（平日），使用者反映「不是每天都會跑」想要可調。worker `scheduler.ts` 已是讀 `ScheduleConfig.pattern` 原樣套用，故**只需放開 DOW 欄位**，worker 與 DB schema 皆不需更動。

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | `pattern` 欄位本就能存任意 cron，無 schema 變更 |
| `worker` | ❌ | `scheduler.ts` 已原樣套用 `pattern`，無需改 |
| `admin` | ✅ | service / API / 監控頁 UI |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `parseHourMinute`→`parseCronParts`(含 weekdays)；新增 `buildCronPattern`；`updateSchedule` 簽名加 `weekdays`、驗證、組 DOW；`ScheduleView` 加 `weekdays` |
| `admin/src/app/api/v1/stock/schedules/route.ts` | 修改 | body 解析 `weekdays:number[]` 傳入 `updateSchedule` |
| `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` | 修改 | 每排程加星期 chips（一~日）+ 中文預覽（零依賴格式器）；`edits`/`saveSchedule` 帶 `weekdays`；區塊副標改文字 |

## 邏輯

- **DOW 編碼**：cron 0–6（0=週日…6=週六）。UI chips 顯示順序 一(1) 二(2) 三(3) 四(4) 五(5) 六(6) 日(0)。
- **`buildCronPattern({hour,minute,weekdays})`**：weekdays 去重排序；空或滿 7 天 → DOW=`*`（每天）；否則逗號清單（如 `1,2,3,4,5`）。回 `"${minute} ${hour} * * ${dow}"`。
- **`parseCronParts(pattern)`**：拆 5 欄取 minute/hour + DOW；DOW 支援 `*`(→全 7 天)、逗號清單、範圍 `a-b`（還原既有 `1-5`）；`7`正規化為 `0`。
- **`updateSchedule(key,hour,minute,weekdays,enabled)`**：驗證 hour 0–23、minute 0–59、weekdays 為 0–6 整數且至少 1 天（全 7 天視為每天）→ `buildCronPattern` → upsert DB → `applySchedule`。
- **監控頁**：`describeSchedule(weekdays,h,m)` 產中文（每天 / 每個工作日 / 週一、三、五）；星期 chips 切換；儲存帶 weekdays；`isDirty` 納入 weekdays 比較。
- **相容**：既有 DB pattern `... 1-5` 經 `parseCronParts` → weekdays `[1,2,3,4,5]`，UI 正確預選平日。

## 測試

- [x] type-check 通過（`npm run type:check --workspace=admin`）。
- [x] E2E（瀏覽器實測）：digest 改「每天」→ 預覽「每天 14:00」、下次由 6/8(週一) 變 6/7(週日)「約 21 小時後」並重排至最前；改回「平日」→ 復原為「每個工作日（一~五）14:00」、下次 6/8。既有 `1-5` 進頁正確顯示「每個工作日（一~五）」。
- [x] 落庫即時生效：save → DB upsert → applySchedule(BullMQ upsert) → next 重算（已於實測確認）。worker 重啟沿用由既有 scheduler.ts 讀 pattern 機制保證（本次未改該檔）。

## 實際變更
<!-- hook -->

## Bug Log
- `admin/src/app/api/v1/stock/schedules/route.ts` — Edit @ 2026-06-06 08:40
- `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` — Edit @ 2026-06-06 08:41
