# 開發日誌: 2026-06-06 — 全站新手友善化（名詞解釋 / 白話結論 / 圖解）

> 關聯 Plan: docs/plans/doing/20260606-003-stock-beginner-friendly.md
> 關聯 Spec: docs/specs/doing/20260606-020-stock-beginner-friendly.spec.md

---

## 事件記錄

### 14:1x — 開始開發

**類型**: 開始開發
**內容**: 使用者要求「讓小白看得懂」，經三輪釐清確認範圍＝四頁（個股詳情/選股器/大盤/Console）× 四形式（浮窗/白話結論/說明區塊/範例圖解），策略選「一次全做」。盤點發現浮窗元件 `InfoTooltip` 已存在但說明散落寫死、無中央字典。
**影響**: 採「中央字典 + 可複用元件 + 各頁套用」三層架構，避免四頁重複文案。

### 14:2x — 決策

**類型**: 決策
**內容**: 字典 `financial-glossary.ts` 每名詞含 short/detail/example 三層，分別餵浮窗 / 速查頁 / 範例。`PlainVerdict` 顏色採台股慣例（紅好綠壞），但加 👍/👀/👎 emoji 避免「紅＝危險」的直覺誤讀。`BeginnerGuide` 用原生 `<details>`，免 'use client'。
**影響**: 個股詳情頁採「分頁切換 → 顯示該分頁相關名詞導覽」的情境式設計。

### 14:3x — 踩坑

**類型**: 踩坑
**內容**: 把 `<th>純文字</th>` 改成 `<th><TermLabel/></th>` 後，IDE 靜態分析報「Table header text should not be empty」(severity: Hint)。實為誤報——`TermLabel` 執行期會渲染名詞文字，a11y 無虞。專案 lint 工具鏈在 Next 16 升級後已失效，改以 `tsc --noEmit` 為把關 gate。
**影響**: 未加 eslint-disable（違反 coding-standards §15.1），保留 DRY 字典設計；以 type:check 驗證。

### 14:4x — 完成

**類型**: 完成
**內容**: 13 個程式碼檔 + 2 locale JSON 完成。`npm run type:check`（admin + worker）零錯誤。Spec 020 / Plan 003 標記 ✅。
**影響**: UI 目視（hover、深色模式、導覽收合）建議實機確認；後續可評估選股器「動作」欄 / 關注清單「評分」欄是否加 `PlainVerdict`。

---

<!-- 以下為 append-only，新事件追加在最後 -->
