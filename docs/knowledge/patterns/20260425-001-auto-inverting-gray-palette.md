# Auto-Inverting Gray Palette（hydrogen / RizzUI 設計慣例）

> 建立日期: 2026-04-25
> 分類: patterns
> 來源 Spec: `docs/specs/completed/20260425-005-dark-mode-gray-fix.spec.md`
> 來源 Bug: 無（屬 Spec 內 Bug Log #1）

---

## 背景

`/admin/login-records` 在 dark mode 下表格 / 卡片背景呈現淺灰色，與 page bg 對比錯亂。追根究柢是 AI 生成程式碼時用 standard Tailwind 慣例（`bg-white dark:bg-gray-800`）寫，但本專案的 `globals.css` 把整個 `gray-0` ~ `gray-1000` palette **在 dark mode 整組反轉**，導致 `dark:bg-gray-800` 在 dark mode 變成 `#e2e2e2`（淺灰）── 完全違反 dark mode 的初衷。

對照 `admin/src/layouts/hydrogen/sidebar.tsx`、`layouts/sticky-header.tsx`、`app/shared/modal-views/container.tsx` 等 RizzUI template 原始檔，皆使用 `dark:bg-gray-{50,100}` 或直接無 `dark:` 變體 ── 證實這是設計慣例，AI 生成時必須遵循。

## 知識內容

### Token 對照表

`admin/src/app/globals.css` 的 `:root` 與 `[data-theme="dark"]` block 把 gray scale **整組反轉**：

| Token | Light (`:root`) | Dark (`[data-theme="dark"]`) | 典型用途 |
| --- | --- | --- | --- |
| `gray-0` | `#ffffff` | `#000000` | 卡片底（auto-flip） |
| `gray-50` | `#fafafa` | `#111111` | body bg / 表格 head |
| `gray-100` | `#f1f1f1` | `#1f1f1f` | 區塊 bg / hover |
| `gray-200` | `#e3e3e3` | `#333333` | border / divider |
| `gray-300` | `#dfdfdf` | `#484848` | input border |
| `gray-400` | `#929292` | `#666666` | 弱化文字 / icon |
| `gray-500` | `#666666` | `#929292` | secondary 文字 |
| `gray-600` | `#484848` | `#a2a2a2` | label |
| `gray-700` | `#333333` | `#dfdfdf` | secondary heading |
| `gray-800` | `#222222` | `#e2e2e2` | primary 文字 |
| `gray-900` | `#111111` | `#f1f1f1` | heading |
| `gray-1000` | `#000000` | `#ffffff` | 強調 |

> 顏色的「明暗順序」在兩個 mode 是**相同的**（編號越大、視覺權重越強）── 這就是「auto-inverting」的精神：寫一次顏色，兩個 mode 都對。

### 三條鐵則

1. **首選：直接用 `gray-N`，不要加 `dark:` 變體**
   - `bg-gray-0`、`text-gray-900`、`border-gray-200` 等已自帶 dark mode 反轉
2. **不得已要 dark-only 微調時，只用 LOW 編號（`50`–`200`）**
   - 例：`bg-white dark:bg-gray-100/50` ── light 為純白，dark 為 `#1f1f1f` 帶透明
   - hydrogen template 內可見此寫法
3. **絕對不要用 HIGH 編號（`700`–`900`）作為 `dark:bg-*` / `dark:border-*`**
   - 例：`dark:bg-gray-800` 在 dark mode 是 `#e2e2e2`（淺灰）── 反向 bug

### 顏色 token（紅 / 綠 / 藍 / 橘）的差別

`tailwind.config.ts` 的 `extend.colors` 對 `red/green/blue/orange` 只新增了 `lighter / DEFAULT / dark` 三個 semantic token，其餘 `red-100`、`red-900` 等仍是 standard Tailwind palette（**不反轉**）。所以：

- ✅ `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400` ── 正確（`green-900` 在 dark mode 仍是深綠）
- ✅ `bg-green-lighter text-green-dark` ── 也正確（lighter / dark token 在本專案有反轉定義）

兩種寫法都 OK，不在本 bug 範圍。

## 適用場景

- AI 生成或 review admin 後台 UI 程式碼時，凡涉及 `gray` 色票，套用上述三鐵則
- 既有檔案若見到 `dark:bg-gray-{700,800,900}` 或 `dark:border-gray-{700,800,900}` ── 直接判定為 bug 修掉
- 檢查指令（粗篩）：

  ```bash
  rg 'dark:[a-z-]*gray-(7|8|9)\d\d' admin/src
  ```

  hits 應僅限 `admin/src/layouts/`、`admin/src/app/shared/`、`admin/src/components/search/`、`admin/src/components/language-switcher.tsx` 這些 RizzUI template 檔（且這些檔內也只用 LOW 編號，不會 hit）。

## 範例

```tsx
// ❌ Bug：dark mode 卡片變淺灰
<div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
  <h3 className="text-gray-900 dark:text-white">標題</h3>
  <p className="text-gray-500 dark:text-gray-400">內文</p>
</div>

// ✅ 修正：依靠 auto-flip
<div className="rounded-lg bg-gray-0 border border-gray-200 p-6">
  <h3 className="text-gray-900">標題</h3>
  <p className="text-gray-500">內文</p>
</div>

// ✅ 也 OK：依 hydrogen template 風格做 dark-only 微調
<aside className="bg-white dark:bg-gray-100/50 border-e-2 border-gray-100">
  ...
</aside>
```

## 注意事項

- **不要動 `globals.css`** ── token 反轉設計是 RizzUI hydrogen 的核心，改了會連動所有 layout / sidebar / modal。
- **不要套到非 `gray` token 上** ── `red/green/blue/orange/yellow/...` 沒有反轉，照 standard Tailwind 慣例使用即可。
- **`bg-white` 不會 auto-flip** ── 它是純 CSS `white`，在 dark mode 還是純白。要 auto-flip 必須用 `bg-gray-0`（同樣 light 為白、dark 為黑）。
- **Modal overlay** ── `dark:bg-opacity-80` 之類用法是 RizzUI Modal 內建的，不要動。

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-04-25: 初次建立，來源 Spec E（20260425-005-dark-mode-gray-fix）
-->
