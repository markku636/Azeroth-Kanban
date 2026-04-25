# Spec D: i18n — API 錯誤碼翻譯（雙碼制）

> 建立日期: 2026-04-25
> 狀態: ✅ 已完成（程式碼層級；E2E 翻譯切換驗證待使用者執行）
> 關聯計劃書: `docs/plans/doing/20260423-001-kanban-board.md`

---

## 目標

依 PRD § Q13「errorCode 雙碼制」，讓後端拋出的 `ApiErrorCode` 在前端 toast 自動以使用者語言呈現。

1. **`errors.{code}` i18n key 補齊** — 對應 `ApiErrorCode` 字典的所有值，於 `zh-TW.json` / `en.json` 加入翻譯（會覆蓋既有舊業務系統殘留的 `errors.*` 段，整段重建）
2. **`tApiError(result, t)` helper** — 接收 `ApiResult` 與 `t`，依 `errorCode` 找翻譯，找不到則 fallback 到 `result.message`；支援 `errorParams` 插值
3. **Kanban toast 路徑改用 `tApiError`** — `useKanbanBoard` 的失敗 toast 由 `result.message` 改為 `tApiError(result)`
4. **保留現有 `useTranslation` 自製 hook** — 本案 PRD i18n 需求（zh-TW / en、key + params、降級到預設語言）已被既有 hook 覆蓋；本 Spec **不**遷移到 `next-intl`，避免 `[locale]` segment 路由重構造成既有頁面回歸風險（已於 AI 協作紀錄記下取捨）

## 背景

Plan 原規劃 Spec D 採 `next-intl` 並改造為 `[locale]` segment routing，但實作時發現：
- 既有 `admin/src/hooks/use-translation.ts` 已實作完整：JSON 字典 + dot-notation key + `{{var}}` 插值 + locale 切換 + fallback
- `next-intl` 需把所有頁面遷入 `[locale]/` 子目錄，影響全部既有 routes（roles / userRoles / audit-logs / login-records / me / login）
- 面試展示時程下，避免大幅 routing 重構帶來的回歸風險

權衡後改為 **保留既有 hook + 補強 ApiErrorCode 翻譯機制**，仍能滿足 PRD § Q13 的雙碼制需求；`next-intl` 遷移留作後續工作。

> 參考知識：本專案 `docs/knowledge/` 目前為空。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | — |
| `common` | ❌ | `ApiErrorCode` 已於 Spec A 建立 |
| `admin` | ✅ | 補 `errors.*` i18n keys；新增 `lib/translate-api-error.ts` helper；`useKanbanBoard` toast 改用 helper |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/translate-api-error.ts` | 新增 | `tApiError(result, t)` helper：以 `errorCode` 查 `errors.{code}` 翻譯，支援 `errorParams` 插值；fallback 到 `result.message` |
| `admin/src/locales/zh-TW.json` | 修改 | `errors.*` 段重建為對應 `ApiErrorCode` 的鍵值（auth / validation / kanban / role_permissions / rate_limit / system） |
| `admin/src/locales/en.json` | 修改 | 同上，英文翻譯 |
| `admin/src/app/admin/(dashboard)/kanban/_lib/use-kanban-board.ts` | 修改 | 失敗 toast 改用 `tApiError(res, t)` 取代 `res.message \|\| t(...)` |

---

## 邏輯變更點

### `tApiError(result, t)` 行為

```typescript
function tApiError<T>(
  result: ApiEnvelope<T>,
  t: (key: string, params?: Record<string, string | number>) => string,
  fallbackKey: string = 'errors.system.internal_error'
): string {
  if (result.success) return '';
  if (result.errorCode) {
    const key = `errors.${result.errorCode}`;
    const translated = t(key, result.errorParams as Record<string, string | number>);
    // useTranslation 找不到 key 時回傳 key 本身；以此判斷是否真有翻譯
    if (translated !== key) return translated;
  }
  // 後端有給 message 就用後端的；否則 fallback
  return result.message || t(fallbackKey);
}
```

> `useTranslation` 既有設計：找不到 key 時先嘗試 `zh-TW` fallback，仍找不到則回傳 key 本身。本 helper 利用「回傳 key === 原始 key」這個訊號判斷翻譯是否存在。

### `errors.*` 字典結構

對齊 `ApiErrorCode` 的巢狀結構：

```json
{
  "errors": {
    "auth": {
      "unauthorized": "請先登入",
      "forbidden": "權限不足",
      ...
    },
    "kanban": {
      "card_not_found": "找不到此卡片",
      "title_too_long": "標題長度不可超過 120 字",
      ...
    },
    ...
  }
}
```

`useTranslation` 已支援 dot-notation 巢狀，故 `t('errors.kanban.card_not_found')` 可正常解析。

---

## 預期測試結果

- [ ] 切換到 en，後端回 `errorCode: 'kanban.card_not_found'` 時 toast 顯示 "Card not found"
- [ ] 後端僅給 `message` 無 `errorCode`，toast 顯示後端 message（向下相容）
- [ ] 後端 `errorParams: { length: 120 }` 時，翻譯插值正確
- [ ] `npm run build` 通過

## 風險評估

- helper 用「回傳 key === 原始 key」判斷翻譯存在；若使用者真的把翻譯文字寫成跟 key 一樣的字串會誤判，但這在實務上極罕見，本案 errors.* 內容均為自然語言句子，不會與 dot-notation key 重合
- 未把所有舊業務系統的 `errors.*` key（如 `API_KEY_MISSING`、`PLATFORM_MISMATCH`）保留下來，因為這些對應的 API 端點已不存在，留著反而誤導；若日後需要可從 git history 復原

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

<!-- — -->

---

## AI 協作紀錄

### 目標確認

讓 API 錯誤訊息可被前端 i18n 翻譯，符合 PRD § Q13「errorCode 雙碼制」。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 保留既有 `useTranslation`，不遷移 next-intl | ✅ 採納 | 既有 hook 已滿足 PRD i18n 需求；遷移需重構全 routing，面試時程下風險 / 收益不對等 |
| `errors.*` 段整段重建（移除舊業務系統殘留） | ✅ 採納 | 舊 keys 對應的 API 已不存在，留著誤導；對齊 ApiErrorCode 字典結構更乾淨 |
| `tApiError` 用 fallback 機制（errorCode 找不到 → message → 預設） | ✅ 採納 | 兼容後端漸進式提供 errorCode 的階段（並非所有 endpoint 都已加） |

### 產出摘要

<!-- AI 完成後自動更新 -->
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/translate-api-error.ts` — Write @ 2026-04-25 04:47
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/kanban/_lib/use-kanban-board.ts` — Edit @ 2026-04-25 04:47
