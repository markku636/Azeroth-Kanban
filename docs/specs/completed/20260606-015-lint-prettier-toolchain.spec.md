# 修復 lint / prettier 工具鏈（Next 16 升級後失效）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

恢復 `npm run lint`、`npm run format` 可用：
1. 改用 ESLint 9 **flat config**（`admin/eslint.config.mjs`），匯入 `eslint-config-next/core-web-vitals` 並移植既有 `.eslintrc.json` 的自訂規則。
2. 補上缺失的 `admin/.prettierrc`（貼合 CLAUDE.md / coding-standards 描述的設定）。
3. 修正 `admin/package.json` 的 lint script（`next lint` → `eslint .`）。
4. 移除已失效的 `admin/.eslintrc.json`。

## 背景

repo 於最近 commit（next 15→16 升級）後，`next lint` 子指令在 Next 16 被移除，導致 `npm run lint` 失敗（`next` 把 `lint` 當成專案目錄）。同時專案實際沒有 `.prettierrc` 設定檔（coding-standards §15.1 雖引用 `admin/.prettierrc` 但檔案不存在），`prettier --check` 退回預設（雙引號）與全 codebase 單引號風格衝突。ESLint 已升級至 9.23.0，legacy `.eslintrc.json` 在 eslint 9 下載入 next 設定時出現 circular structure 錯誤。`eslint-config-next@16.2.4` 已內建 flat config 匯出（`./core-web-vitals` 為長度 4 的 flat config 陣列），故採原生 flat config 最乾淨。

> coding-standards §15.1 已預告：「若使用者未來新增 `eslint.config.{js,mjs,ts}`，AI 應優先讀取新版設定檔」— 本次即為該遷移。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | ESLint / Prettier 設定 + lint scripts |

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/eslint.config.mjs` | 新增 | ESLint 9 flat config：`eslint-config-next/core-web-vitals` + 移植自訂規則 |
| `admin/.prettierrc` | 新增 | Prettier 設定（singleQuote、printWidth 100、trailingComma all、tailwindcss plugin 等） |
| `admin/package.json` | 修改 | `lint: "eslint ."`、`lint:fix: "eslint . --fix"`（format 系列維持） |
| `admin/.eslintrc.json` | 刪除 | 已被 flat config 取代，eslint 9 flat 模式下為 dead config |
| `admin/next.config.js` | 修改 | 移除無 await 的 `async redirects()`（require-await） |
| `admin/src/lib/stock-service.ts` | 修改 | 5× `.catch(() => {})` 補上錯誤 log（no-empty-function + 對齊 no-silent-catch 規範） |
| `.claude/rules/coding-standards.md` | 修改 | §15.1 設定檔來源表更新指向新檔（doc 準確性） |

### 既有債務清理（全部修到綠）

`prettier --write .` + `eslint . --fix` 自動修掉 121 檔格式 + 81 個 eslint，剩 56 errors 以下列方式收尾：

| 類別 | 數量 | 處理 |
| --- | --- | --- |
| eqeqeq（全為 `!= null`/`== null` 空值守衛慣例） | 28 | config 改 `['error', 'smart']`：允許安全的 `== null` 空值守衛，其餘值比較仍強制嚴格相等。避免把 `unknown` 型別的 `!= null` 誤改成 `!== null` 而漏接 undefined |
| react-hooks/set-state-in-effect | 17 | config 降為 `warn`：React 19 plugin 新增的嚴格規則，命中 `setMounted(true)` 等合法 hydration/同步樣式；非使用者原 ruleset，無乾淨改法 |
| no-empty-function（皆為 `.catch(() => {})`） | 5 | 程式碼補 log（同時修正 no-silent-catch 違規） |
| no-irregular-whitespace（皆為中文排版全形空白 `　`） | 4 | config 加 `{ skipStrings, skipTemplates, skipJSXText: true }`：保留對程式碼間雜散空白的防護，允許顯示文字的全形空白 |
| require-await | 1 | 移除 next.config.js 的多餘 `async` |
| react-hooks/purity | 1 | config 降為 `warn`：render 中用 `Date.now()` 算相對時間，新嚴格規則 |

---

## 邏輯變更點

- `eslint.config.mjs`：`export default [ ...nextCoreWebVitals, { rules: {自訂} }, { ignores: ['.next/**'] } ]`。自訂規則完整移植 `.eslintrc.json`（no-var、prefer-const、eqeqeq、curly、dot-notation、no-else-return、require-await、no-lonely-if、max-classes-per-file 等；關閉 `react/no-unescaped-entities`、`@next/next/no-page-custom-font`、`@typescript-eslint/no-explicit-any`）。
- `.prettierrc`：semi、singleQuote=true、jsxSingleQuote=false、trailingComma=all、printWidth=100、tabWidth=2、useTabs=false、bracketSpacing=true、bracketSameLine=false、arrowParens=always、endOfLine=lf、plugins=['prettier-plugin-tailwindcss']。

## 回滾計劃

1. 還原 `package.json` lint scripts；刪除 `eslint.config.mjs`、`.prettierrc`；恢復 `.eslintrc.json`。

## 預期測試結果

- [x] `npx eslint .`（admin）可執行、TS/TSX 正確解析、無設定載入錯誤
- [x] `npx prettier --check .` → exit 0「All matched files use Prettier code style!」
- [x] `npm run lint`（root workspace 轉發）→ exit 0（0 errors / 20 warnings）
- [x] `npm run type:check` 通過（exit 0）

## 風險評估

- flat config 不再 lint `.json`（eslint 預設不處理），原 `.eslintrc.json` 的 `*.json quotes:off` override 不再需要（移除）。
- 未安裝 `eslint-config-prettier`；自訂規則皆為邏輯型、與 prettier 格式不衝突，故不需額外安裝。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

承前一任務尾聲提到的 lint/prettier 工具鏈失效，使用者選擇「補齊 prettier + ESLint(Next16) flat config」。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 用原生 `eslint-config-next/core-web-vitals` flat 匯出，而非 FlatCompat | ✅ 採納 | 實測為 flat config 陣列；避開 legacy 載入的 circular structure 錯誤 |
| 不安裝 eslint-config-prettier | ✅ 採納 | 自訂規則非格式型、與 prettier 無衝突，避免新增相依 |

### 產出摘要

- 新增 `admin/eslint.config.mjs`（ESLint 9 flat config）：`import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'` + 移植 `.eslintrc.json` 全部自訂規則；`eqeqeq:'smart'`、`no-irregular-whitespace` 加 skip 選項、`react-hooks/set-state-in-effect` 與 `react-hooks/purity` 降為 `warn`。
- 新增 `admin/.prettierrc`（semi/singleQuote/printWidth 100/trailingComma all/arrowParens always/endOfLine lf/tailwindcss plugin）；`admin/.prettierignore` 補上 `next-env.d.ts`。
- `admin/package.json`：`lint: "eslint ."`、`lint:fix: "eslint . --fix"`；刪除 `admin/.eslintrc.json`。
- 既有債務清乾淨：`prettier --write .`（121 檔）+ `eslint . --fix`（81）+ 手動修 6（next.config.js 移除 async、stock-service.ts 5× catch 補 log + 合併重複 import + 補 if 大括號）。
- 最終：`npm run lint` 0 errors / 20 warnings（exit 0）、`prettier --check .` 全綠、`tsc --noEmit` 通過。
- 文件：`coding-standards.md` §15.1 / §15.3 改指向 `eslint.config.mjs`。
- 部署：本次為 dev 工具鏈 + 等價格式化/記錄，無 runtime 行為改變，不需重建 admin 容器（關注清單功能的容器已於前一任務重建）。
