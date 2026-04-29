# Coding Standards（來源：https://blog.markkulab.net/post/coding-standard）

這些是本專案強制遵守的 Coding Standards，AI 在產出任何程式碼時必須自主遵守。

---

## 一、命名規則

依據 `docs/requirements/sa.md` § 10.1 命名規範：

| 層級 | 命名風格 | 範例 |
|------|----------|------|
| 資料庫欄位（PostgreSQL） | `snake_case` | `ref_code`、`is_referral`、`plan_type` |
| 後端變數／函式（TypeScript） | `camelCase` | `refCode`、`isReferral`、`planType` |
| 後端型別／介面 | `PascalCase` | `CommissionRule`、`SubscriptionEvent` |
| 後端常數 | `UPPER_CASE` | `CACHE_TTL`、`API_RETURN_CODE` |
| 前端元件 | `PascalCase` | `DataTable`、`StatusBadge` |
| 前端 Props／變數 | `camelCase` | `isActive`、`commissionRate` |
| 檔案名稱 | `kebab-case` | `commission-service.ts`、`data-table.tsx` |
| CSS class | Tailwind utilities | 透過 `cn()` 工具函式合併 |
| API 請求／回應（JSON） | `camelCase` | `{ "refCode": "XXX", "isReferral": true }` |
| PRD/SA 文件欄位 | `snake_case` | 文件以資料庫欄位為準，各端實作時依上述規則轉換 |

> **Prisma 映射**：資料庫欄位使用 `snake_case`，透過 `@map()` 映射至 TypeScript `camelCase` 屬性。

- **命名要有意義**：避免縮寫或語意不清的名稱（`data`、`info`、`temp` 等）
- **方法命名格式**：動詞 + 名詞（例如 `getUserProfile`、`updateCommissionRule`、`deleteAgent`）
- **Boolean 變數**：以 `is`、`has`、`can`、`should` 開頭（例如 `isLoading`、`hasPermission`）

---

## 二、型別安全

- **強制使用 TypeScript**：所有程式碼必須以 `.ts` / `.tsx` 撰寫，禁止使用 `.js` / `.jsx`
- 避免使用 `any`，僅在絕對必要的例外情況下使用
- 嚴格遵守專案 ESLint / Prettier 設定（詳見 §15）
- 使用嚴格相等（`===`、`!==`），禁止使用 `==`、`!=` 鬆散比較

---

## 三、程式碼品質

- **避免魔法數字（Magic Numbers）**：將固定值抽出為 `const` 或 `enum` 集中管理
- **方法單一職責**：每個方法只處理一件事；過大的方法拆分成小方法
- **複用邏輯**：相同邏輯出現三次以上才抽成共用函式；兩次可能只是巧合，過早抽象反而增加耦合
- **React 元件**：過大或可複用的元件必須拆分出獨立元件
- **減少 template 邏輯**：React 的 JSX/TSX 中盡量不寫複雜邏輯，資料提前處理好再傳入
- **避免多層三元運算子**：超過 3 層的 ternary 改用獨立方法或狀態管理

---

## 四、Null / Undefined 處理

- 使用短路求值（`&&`、`||`、`??`）時，必須為 `undefined` / `null` 提供預設值 ，禁止讓它們無聲地傳遞到下一層造成錯誤(fail )
- 禁止讓 `undefined` / `null` 無聲地傳遞到下一層

---

## 五、可讀性與註解

- 複雜邏輯或意圖不明確的段落，必須加上說明型註解
- 不要保留無用的 `console.log`、dead code、暫時測試程式碼

---

## 六、硬編碼（Hard Coding）

- **禁止**將固定值直接寫入程式碼，應維持彈性


---

## 七、技術債

- 暫時性解法必須加上 `// TODO:` 註解，記錄原因與日後處理方向
- 不允許讓 workaround 堆積而不記錄

---

## 八、函式設計

- **函式長度**：單一函式不超過 50 行；超過時拆分成更小的方法
- **參數數量**：單一函式參數不超過 4 個；超過時改用 options object（`{ param1, param2, ... }`）
- **Early Return**：提早 return 來減少巢狀縮排，避免深層 if/else
- **純函式優先**：能寫成純函式（相同輸入必得相同輸出）就不要有副作用
- **避免副作用**：函式不應靜默修改外部狀態；若需要，命名與文件須明確標示

```typescript
// ❌ 深層巢狀
function process(user) {
  if (user) {
    if (user.active) {
      if (user.role === 'agent') {
        // 邏輯...
      }
    }
  }
}

// ✅ Early Return
function process(user) {
  if (!user) return;
  if (!user.active) return;
  if (user.role !== 'agent') return;
  // 邏輯...
}
```

---

## 九、非同步處理

- 統一使用 `async/await`，禁止混用 `.then()/.catch()` 與 `async/await`
- 非同步操作必須有 `try/catch` 或透過上層統一錯誤處理（如 `ApiResult` pattern）
- 禁止在 `catch` 區塊中靜默吞掉錯誤（空的 catch block）
- 平行無相依的非同步操作使用 `Promise.all()`，不要依序 await

```typescript
// ❌ 依序等待（浪費時間）
const a = await fetchA();
const b = await fetchB();

// ✅ 同時執行
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

---

## 十、Import 管理

- 移除所有未使用的 import
- Import 順序：外部套件 → 內部模組（`@azeroth/common`）→ 相對路徑（`@/*`）→ 型別
- 優先使用 named import，避免 default import 帶來的命名不一致；框架慣例（Next.js page component、`next/image`、`next/link`、`next/font` 等）為例外，遵循框架要求即可

---

## 十一、常數與列舉

- 字串 literal 出現三次以上，或跨多處使用且具語意意義，才抽成 `const` 或 `enum`
- 錯誤訊息、狀態碼、路徑等固定字串集中在 `config/` 目錄統一管理
- Enum 使用 PascalCase 名稱 + UPPER_CASE 值（例如 `CommissionStatus.PENDING`）

---

## 十二、React / Next.js 特定規則

- **Props 型別**：每個元件必須明確定義 props interface，禁用 `any`
- **useEffect 依賴**：deps array 必須完整列出所有依賴，不允許缺漏
- **避免過度 useEffect**：能用 derived state（`useMemo`）計算的就不要用 `useEffect`
- **Key prop**：list render 的 `key` 必須使用穩定唯一 ID，禁止使用 index
- **條件渲染**：避免 `{condition && <Component />}` 中 condition 為數字 `0` 的陷阱，改用 `{!!condition && ...}` 或三元
- **Server / Client 元件分離**：能用 Server Component 就不加 `'use client'`；`'use client'` 的邊界盡量往葉節點推

---

## 十三、安全性

- 禁止將 secret、API Key、密碼等敏感資訊 hard code 在程式碼中，一律從環境變數讀取
- 任何來自外部的輸入（使用者輸入、API 回應）在使用前必須驗證（Zod schema）
- 禁止直接將使用者輸入拼接進 SQL 或 Shell 指令（防止 Injection）
- API Route 的權限守衛不可省略（`withPermission` / `withAgent`）

### 13.1 密碼與敏感欄位（禁止明碼儲存）

- **密碼欄位一律雜湊後再存入資料庫**，禁止以明碼（plaintext）形式儲存
- 使用 `bcrypt`（或同等強度演算法，如 `argon2`）進行雜湊，cost factor 不低於 10
- 禁止將密碼寫入 log、API 回應、`ApiResult.message` 任何地方
- 驗證密碼時使用時序安全的比對函式（如 `bcrypt.compare()`），禁止直接字串比對

```typescript
// ❌ 明碼存入資料庫
await prisma.members.create({ data: { password: plainPassword } });

// ✅ 雜湊後存入
import bcrypt from 'bcrypt';
const hashedPassword = await bcrypt.hash(plainPassword, 12);
await prisma.members.create({ data: { password: hashedPassword } });

// ✅ 驗證時使用時序安全比對
const isMatch = await bcrypt.compare(inputPassword, storedHash);
```

### 13.2 字串拼接一律使用參數化（防止 Injection）

- 任何涉及 SQL、Shell 指令、URL、HTML 的字串，**禁止**直接用 `+` 或 template literal 拼接使用者輸入
- 資料庫查詢：透過 Prisma ORM 的結構化查詢，需要原生 SQL 時使用 `prisma.$queryRaw` 搭配 `Prisma.sql` tagged template
- Shell 指令：禁止使用 `exec`、`eval` 帶入使用者輸入；若必要則使用 `execFile` 並傳入參數陣列
- URL 查詢參數：使用 `URLSearchParams` 或 `encodeURIComponent()` 處理

```typescript
// ❌ 直接拼接 SQL（SQL Injection 風險）
const result = await prisma.$queryRawUnsafe(
  `SELECT * FROM members WHERE email = '${userInput}'`
);

// ✅ 使用 Prisma 結構化查詢
const result = await prisma.members.findUnique({ where: { email: userInput } });

// ✅ 原生 SQL 必須使用 Prisma.sql tagged template
const result = await prisma.$queryRaw(
  Prisma.sql`SELECT * FROM members WHERE email = ${userInput}`
);

// ❌ 直接拼接 URL 參數
const url = `https://api.example.com/search?q=${userInput}`;

// ✅ 使用 URLSearchParams
const params = new URLSearchParams({ q: userInput });
const url = `https://api.example.com/search?${params}`;
```

---

## 十四、錯誤處理

### 14.1 ApiResult Pattern（強制）

Service 層一律回傳 `ApiResult<T>`，**禁止 `throw`**。好處：
- 呼叫方不需 try/catch，錯誤路徑與成功路徑都在同一型別內
- Controller / API Route 直接轉發結果，無需額外包裝
- 型別系統強制檢查呼叫方處理 `success: false` 的情況

初始化一律設為「失敗」預設值，僅在明確成功時才翻轉：

```typescript
// ✅ 正確的 ApiResult 結構
const result: ApiResult<Member> = {
  success: false,
  code: ApiReturnCode.INTERNAL_ERROR,
  message: '',
  timestamp: Date.now(),
};
try {
  const member = await prisma.members.findUniqueOrThrow({ where: { id: memberId } });
  result.success = true;
  result.code = ApiReturnCode.SUCCESS;
  result.data = member;
} catch (e) {
  console.error(`[MemberService.getById] memberId=${memberId}`, e);
  result.message = '會員資料讀取失敗，請稍後再試';
}
return result;
```

### 14.2 錯誤碼分類（禁止全部回 500）

使用 `ApiReturnCode` 明確分類，讓前端能針對不同情境給予對應 UI 回饋：

| 情境 | ApiReturnCode | HTTP 語意 |
|------|---------------|-----------|
| 輸入驗證失敗（缺欄位、格式錯誤） | `VALIDATION_ERROR` | 400 |
| 資源不存在 | `NOT_FOUND` | 404 |
| 無此操作權限 | `FORBIDDEN` | 403 |
| 超出速率限制 | `RATE_LIMITED` | 429 |
| 其他非預期錯誤 | `INTERNAL_ERROR` | 500 |

```typescript
// ❌ 一律回 INTERNAL_ERROR — 前端無法區分是輸入問題還是系統問題
result.code = ApiReturnCode.INTERNAL_ERROR;

// ✅ 依實際情境分類
if (!memberId) {
  result.code = ApiReturnCode.VALIDATION_ERROR;
  result.message = 'memberId 為必填';
  return result;
}
const member = await prisma.members.findUnique({ where: { id: memberId } });
if (!member) {
  result.code = ApiReturnCode.NOT_FOUND;
  result.message = `找不到 memberId=${memberId} 的會員`;
  return result;
}
```

### 14.3 錯誤訊息品質

錯誤訊息必須包含足夠上下文，讓開發者能直接定位問題，**禁止**模糊訊息：

| ❌ 不良範例 | ✅ 改良範例 |
|------------|------------|
| `"Error"` | `"月結算失敗：settlementId=xxx 對應的 member 不存在"` |
| `"Something went wrong"` | `"點數到期 Job 執行失敗：批次大小超出上限（actual=1500, max=1000）"` |
| `"Not found"` | `"找不到 platformId=${platformId} 的平台，請確認 ID 是否正確"` |

Server log 訊息格式建議：`[ClassName.methodName] 關鍵參數=值, 說明`

### 14.4 使用者訊息 vs. 技術細節嚴格分離

- **`ApiResult.message`**：給使用者看的人可讀訊息（中文、無技術堆疊、無 DB 細節）
- **`console.error` / logger**：完整原始例外（stack trace、SQL error、第三方 API 回應）絕不外洩至 API 回應

```typescript
// ✅ 分離範例
} catch (e) {
  // Server log：完整技術細節供排查
  console.error(`[SettlementService.run] year=${year} month=${month} 月結失敗`, e);
  // 使用者訊息：人可讀，不含技術細節
  result.message = '月結算執行失敗，請聯絡系統管理員';
}
```

### 14.5 禁止空的 catch block

靜默吞掉錯誤會讓問題在生產環境無聲消失，`catch` 內至少必須：
1. 記錄 log（`console.error` 或注入的 logger）
2. 更新 `result.code` 與 `result.message`

```typescript
// ❌ 靜默吞掉
} catch (e) {
  // 什麼都不做
}

// ❌ 只 log 但忘記設 result
} catch (e) {
  console.error(e);
  // result 仍是預設的 INTERNAL_ERROR + 空 message → 前端拿到無意義回應
}

// ✅ 完整處理
} catch (e) {
  console.error(`[FooService.bar] id=${id}`, e);
  result.code = ApiReturnCode.INTERNAL_ERROR;
  result.message = '操作失敗，請稍後再試';
}
```

---

## 十五、ESLint 與 Prettier 排版規範（硬性）

AI 在產出任何程式碼前，**必須**先讀取並遵守專案根目錄下的 ESLint / Prettier 設定檔，產出後也必須符合 lint 與 format 通過的狀態。這是硬性規範，AI 不得自行覆寫專案規則或產出與設定不一致的程式碼。

### 15.1 設定檔來源（單一真實來源）

| 工具 | 設定檔 | 優先級 |
| --- | --- | --- |
| ESLint | [`admin/.eslintrc.json`](../../admin/.eslintrc.json) | 專案規則 > 個人偏好 |
| Prettier | [`admin/.prettierrc`](../../admin/.prettierrc) | 專案規則 > 個人偏好 |

- 若使用者未來新增 `eslint.config.{js,mjs,ts}` 或 `prettier.config.{js,mjs,ts}`，AI 應優先讀取新版設定檔
- AI **禁止**在程式碼內以 `// eslint-disable-*` / `// prettier-ignore` 等指令繞過規則，除非：
  1. 使用者明確要求
  2. 該規則確實與正確程式邏輯衝突，且已在註解中說明原因（必須包含「為何不能修」「規則名稱」）

### 15.2 Prettier 必須遵守的格式設定

依據 `admin/.prettierrc`，以下為硬性格式要求（AI 在產出 / 編輯程式碼時必須符合）：

| 設定項 | 值 | 說明 |
| --- | --- | --- |
| `semi` | `true` | 行末必須加分號 |
| `singleQuote` | `true` | TS / JS 字串使用單引號 `'`；避免雙引號 `"` |
| `jsxSingleQuote` | `false` | JSX 屬性使用雙引號（`<Foo bar="baz" />`） |
| `trailingComma` | `"all"` | 多行陣列 / 物件 / 參數列表末尾必須加逗號 |
| `printWidth` | `100` | 單行最長 100 字元，超過必須換行 |
| `tabWidth` | `2` | 縮排 2 空白 |
| `useTabs` | `false` | 一律使用空白，禁止 tab 字元 |
| `bracketSpacing` | `true` | 物件字面量大括號內加空白：`{ foo }` 而非 `{foo}` |
| `bracketSameLine` | `false` | JSX 多屬性時 `>` 換行寫 |
| `arrowParens` | `"always"` | 箭頭函式參數一律加括號：`(x) => x`，禁止 `x => x` |
| `endOfLine` | `"lf"` | 換行符使用 LF（Unix），禁止 CRLF |
| Tailwind class 排序 | 啟用 `prettier-plugin-tailwindcss` | 類別順序由 plugin 決定，AI 不得手動排序 |

> Tailwind 函式 `cn`、`clsx`、`twMerge` 內部的 class 字串會被 plugin 自動排序，AI 在產出時不需手動排，但**字串內必須是空白分隔的合法 Tailwind utilities**。

### 15.3 ESLint 必須遵守的關鍵規則

依據 `admin/.eslintrc.json`，AI 產出程式碼必須避免下列違規（節錄硬性規則，非完整列表，完整以設定檔為準）：

- **變數宣告**：禁止 `var`；可不被重新賦值的變數必須用 `const`（含解構：解構中只要有一個成員可為 const 就要用 const）
- **嚴格相等**：`eqeqeq` — 必須 `===` / `!==`（與 §二 重複，雙重保險）
- **控制流**：`curly` — `if` / `for` / `while` 一律加大括號；禁止 `else` 後僅有單一 `if`（用 `else if`）
- **避免 dead code**：禁止空語句區塊（`no-empty`）、空函式（`no-empty-function`）、空解構（`no-empty-pattern`）
- **避免重複**：禁止從同一模組重複 `import`（`no-duplicate-imports`）；禁止函式參數 / 物件 key / switch case 重名
- **async/await**：`require-await` — `async` 函式內必須有 `await`，否則改為一般函式
- **Class**：單一檔案只允許一個 class（`max-classes-per-file`）
- **NaN 比較**：必須用 `Number.isNaN()`，禁止 `x === NaN`
- **物件存取**：能用點號就用點號（`obj.foo`），不寫 `obj['foo']`
- **`else return`**：`if` 區塊內 return 後不再寫 `else`（讓邏輯扁平）

### 15.4 AI 自我檢查流程

AI 完成程式碼編輯後，必須在心中模擬以下檢查（可視為「產出前的自審清單」）：

1. **Prettier 格式**：行寬 / 引號 / 分號 / 縮排 / trailing comma 是否符合 §15.2？
2. **ESLint 規則**：是否觸發 §15.3 列出的任一硬性違規？
3. **Import 順序**：是否符合 §十、Import 管理？
4. **Tailwind class**：若有 `className`，是否使用 `cn()` 包裝多條件 class？

**未通過自審 → 必須先修正再回應使用者**，禁止把「請執行 `npm run lint` / `npm run format` 修一下」的任務丟回給使用者。

### 15.5 推薦驗證指令（使用者端執行）

| 指令 | 用途 |
| --- | --- |
| `npm run lint` | 跑完整 ESLint 檢查 |
| `npx prettier --check .` | 檢查 format 是否一致 |
| `npx prettier --write .` | 自動格式化（產出後可選用） |

> AI **不應**在每次小改動後自動跑這些指令；但若使用者回報「lint / format 失敗」，AI 必須立即依錯誤訊息修正，不得忽略。

