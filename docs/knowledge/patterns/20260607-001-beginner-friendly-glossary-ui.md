# 小白友善 UI：中央名詞字典 + 薄殼元件 + 共用 portal 浮窗

> 建立日期: 2026-06-07
> 分類: patterns
> 來源 Spec: docs/specs/doing/20260606-020-stock-beginner-friendly.spec.md、20260606-022-tooltip-portal-health-score.spec.md（並含 20260607-002~005 的擴充驗證）
> 來源 Bug: 無

---

## 背景

股票後台對不懂股市的使用者（小白）滿是專有名詞。需求是「全站可看懂」，且四種呈現形式並存：滑鼠浮窗、白話結論、可收合導覽、範例圖解。若各頁各自寫死說明文字，會大量重複、難維護。後續又有多個並行 spec（技術指標、估值河流、策略選股）持續新增名詞——架構必須能無痛擴充。

## 知識內容

**核心：一份字典 + 一組薄殼元件，所有頁面只引用、不寫死。**

1. **中央字典是單一真實來源** — `admin/src/config/financial-glossary.ts`
   - `GlossaryEntry { term, aka?, short, detail, example? }`：四層深淺對應四個呈現面。
     - `short` → 浮窗 tooltip + 新手導覽
     - `detail` → 名詞速查頁
     - `example` → 範例圖解（浮窗 / 速查 / 導覽）
   - `GLOSSARY: Record<GlossaryKey, GlossaryEntry>`：**型別強制完整性** — 在 `GlossaryKey` union 加一個 key，TypeScript 就逼你補上對應 entry，漏不掉。

2. **薄殼展示元件，全部讀字典**（`admin/src/components/stock/`）
   - `TermLabel`（`termKey`）→ 名詞文字 + ⓘ 浮窗（內容取 `short`/`example`）。
   - `BeginnerGuide`（`keys[]`）→ 可收合「新手導覽」，用**原生 `<details>`**，免 `'use client'`、免 JS 狀態、server-safe。
   - `PlainVerdict`（`tone`）→「白話結論」彩色標籤；搭配 `lib/beginner-verdict.ts` 的純函式（值 → `{ text, tone }`，對 null 回中性）。

3. **唯一一個共用底層浮窗 `InfoTooltip`** — 這是最大複用槓桿。
   - spec 020 先做純 CSS `absolute` 版；spec 022 因表格 `overflow-x-auto` 裁切浮窗，把它**就地改成 `createPortal` 到 `document.body` + `position: fixed`**（依 `getBoundingClientRect()` 定位、水平 clamp、近底上翻）。
   - 因為 `TermLabel` 全站 40+ 處都走這支元件，**改一處＝全站修好**。這就是「保持單一共用浮窗」的回報。

4. **`GLOSSARY_GROUPS` 驅動速查頁與分類** — `GLOSSARY_GROUPS.map(...)` 渲染整頁。

## 適用場景

- 要在股票 UI 新增任何技術指標 / 基本面 / 籌碼名詞。
- 要為任何數值加「白話結論」（便宜/偏貴、偏多/偏空…）。
- 任何「需要對非專業使用者解釋」的密集數據介面。

## 範例

新增一個名詞的標準步驟（型別檢查會逼你完成 1–3）：

```ts
// 1. financial-glossary.ts：加進 union
export type GlossaryKey = /* … */ | 'NEW_TERM';

// 2. 加進 GLOSSARY（型別強制）
NEW_TERM: {
  term: '新名詞',
  short: '一句話白話解釋。',
  detail: '速查頁用的完整說明。',
  example: '例：具體數字 → 結論。',
},

// 3. 加進某個 GLOSSARY_GROUPS 分類（⚠️ 非型別強制，漏了速查頁就不顯示）
{ title: '技術面（看走勢 / 買賣點）', keys: [/* … */ 'NEW_TERM'] },

// 4.（選配）需要白話結論時，在 beginner-verdict.ts 加純函式
export function newTermVerdict(v: number | null | undefined): Verdict { /* … */ }
```

頁面端只要：`<TermLabel termKey="NEW_TERM" />`、`<PlainVerdict tone={v.tone}>{v.text}</PlainVerdict>`、`<BeginnerGuide keys={['NEW_TERM', ...]} />`。

## 注意事項

- **`GLOSSARY_GROUPS` 成員不受型別強制**：key 在 union/GLOSSARY 但忘了歸進任一 group → 名詞速查頁會**靜默漏掉**它。新增名詞務必同時歸類。
- **不要再造第二套浮窗元件**：一律用共用的 `InfoTooltip`（已是 portal 版）。重複實作會失去「改一處全站受益」的槓桿，也會出現裁切/定位不一致。
- **白話結論顏色走台股慣例**：`good`＝紅、`bad`＝綠、`neutral`＝灰；為避免「紅＝危險」直覺誤讀，`PlainVerdict` 額外加 👍/👀/👎 emoji。
- **薄殼元件 server/client 皆可用**：`TermLabel`/`PlainVerdict`/`BeginnerGuide` 無 hook、無瀏覽器 API，server component（如速查頁）與 client page 都能放；只有 `InfoTooltip`（portal）是 `'use client'`。
- **lint 工具鏈在 next16 升級後失效**：本系列以 `npm run type:check`（admin + worker）把關（見 memory：lint-format-toolchain-broken）。

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-06-07: 初次建立，來源 Spec 20260606-020（地基）+ 20260606-022（portal 浮窗），並經 20260607-002~005 擴充至 47 詞驗證架構可擴。
-->
