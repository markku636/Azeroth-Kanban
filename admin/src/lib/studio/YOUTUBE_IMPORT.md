# 抄 YouTube → 原創短片（YouTube Import）

貼一支 YouTube 網址或字幕逐字稿 → AI **轉化式改編**（萃取其敘事結構與節奏，產出**內容原創**的分鏡，
明確禁止逐字照抄）→ 使用者審核微調 → 落庫成本專案的分鏡，供後續生圖／生片。目標：能做到 **~2 分鐘**的片。

## 檔案地圖

| 檔 | 責任 |
| --- | --- |
| `youtube-import.ts` | 網址 → 字幕：`parseYoutubeId` / `fetchYoutubeSource`（best-effort，逐軌嘗試 `orderCaptionTracks`）/ `parseTimedText` / `cleanSourceTranscript`（剝時間碼、SRT/VTT、`[音樂]`、重複行） |
| `pacing.ts` | 純函式：`shotsForDuration`/`estimatedSeconds`（片長↔鏡數）、`estimateShotSeconds`/`estimateStoryboardSeconds`（依旁白字數估時長）、`planAdaptationBatches`/`sliceByFraction`（分批切稿） |
| `interview.ts` | `adaptStoryboardFromSource`（分批改編核心）、`coercePlannedShots`、`parseShotArray`（含截斷救援） |
| `json-tolerant.ts` | `tolerantJsonParse`（容忍尾逗號）、`salvageArrayObjects`（截斷陣列救回完整物件） |
| `storyboard-checks.ts` | `checkStoryboard`：即時、確定性、免 API 的品質健檢（warn 優先） |
| `storyboard-audit.ts` | LLM 深度健檢，用 `checkStoryboard` 的確定性事實接地 |
| `youtube-meta.ts` | 成片的社群上架文案（標題/縮圖字/說明/hashtags） |
| `api/v1/studio/projects/[id]/from-youtube/route.ts` | 三種模式（見下） |
| `app/(dashboard)/studio/[id]/_components/youtube-import-modal.tsx` | 兩階段 UI |

## 流程

1. **輸入**：貼逐字稿（最可靠）或填網址（best-effort 抓字幕，常被 YouTube 擋 → 退回貼上）。選目標片長、風格。
2. **改編預覽**（route `persist:false`）：
   - 鏡數 ≤ 12 → 單次 LLM 呼叫；> 12 → **分批改編**（`planAdaptationBatches`）：逐字稿依比例切段、
     每段帶「開頭/中段/結尾」定位＋上一段旁白承接脈絡，突破單次 token/品質瓶頸。
   - 韌性：空輸出重試一次、單批拋錯不作廢（保留其他批）、JSON 截斷救回完整物件。
3. **審核**：改旁白/大字幕、切靜態↔i2v、重排、刪、**新增鏡**、即時健檢（可點跳轉）。
4. **建立**（route 收 `shots:[...]`）：略過 LLM、直接落庫**審核後的那批**（非重跑 AI）。可選填新場景名稱。

## route 三模式（同一個 POST）

- `{ shots:[...] , sceneTitle? }` → 直接落庫已審核分鏡（不需 AI 憑證）
- `{ url|source, count, styleHint?, persist:false }` → 改編後回 `{shots}` 供預覽
- `{ url|source, count, persist:true }` → 改編後直接落庫（向後相容）

上限 40 鏡（~2.5 分）。`styleHint` 讓「沿用來源節奏、換成不同調性」。

## 健檢項目（`checkStoryboard`，研究背書）

片長 vs 目標、`long-target`(>75s 完播率)、`slow-hook`(第1鏡旁白>22字)、`weak-ending`(結尾無旁白/字幕)、
`all-still`(無動態鏡)、`caption/punchline-long`(>14字)、`tts-long`(>42字)、`silent`、`dup-narration`(相鄰重複)。

## 設定 / gate

- 要 AI：admin 容器需 `LLM_PROVIDER`（anthropic|vertex）＋對應憑證。modal 會先查 `/config` 預檢。
- 品質閘：`npx tsc --noEmit`（唯一可接受殘留是 stale `.next` 舊 kanban 型別）＋ `npx vitest run src/lib/studio/`。

## 踩雷

- YouTube 2026 對伺服器端抓字幕反爬嚴重 → 主路徑是**使用者貼逐字稿**，網址抓取只是 best-effort。
- 分批改編的每批 `maxTokens` 隨鏡數放寬（`700 + count*320`），避免長批 JSON 被 4096 預設截斷。
- SDXL 無法渲染可讀文字 → `visual` 不要求畫面出現字，文案交給 `caption`/`punchline` 後製燒錄。
