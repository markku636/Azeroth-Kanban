# 修復 Docker Build 失敗

> 建立日期: 2026-04-29
> 狀態: ✅ 已完成
> 關聯計劃書: 無（中型 Spec，無 Plan）

---

## 目標

讓 `docker compose build admin` 重新成功，恢復到可以 `docker compose up` 一鍵啟動的狀態。

## 背景

升級 Next.js 15.2.4 → 15.2.9（修 CVSS 10 critical RCE）+ `@types/react` 19.0.12 → 19.2.14（解 ReactNode 型別衝突）後，Docker build 連續出現多個錯誤：

1. ✅ ReactNode 型別衝突 → 已透過 `@types/react` dedupe 修復
2. ✅ `next: not found` → 已透過補 `COPY --from=deps /app/admin/node_modules` 修復
3. 🔵 React error #31（"Objects are not valid as a React child"）at `/_error: /404` prerender — **進行中**

第三個錯誤在本地 `npm run build` 也能重現，與 Docker 無關，是 not-found.tsx 與某個 Provider / 元件互動下 prerender 失敗。

> 參考知識：
> - `docs/knowledge/architecture/20260425-001-monorepo-workspace-layout.md` — npm workspaces hoisting 行為
> - `docs/knowledge/integrations/20260425-001-nextauth-v5-keycloak-dual-provider.md` — NextAuth v5 SessionProvider 在 RootLayout 的使用模式

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | — |
| `common` | ❌ | — |
| `admin` | ✅ | Dockerfile + not-found.tsx + 可能其他相關檔案 |

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/Dockerfile` | 修改 | 補 `COPY --from=deps /app/admin/node_modules` 解決 workspace hoisting |
| `admin/src/app/not-found.tsx` | 修改 | 修復 prerender 時的 React error #31（具體修法依診斷結果決定） |
| `admin/src/app/layout.tsx` | 可能修改 | 若診斷顯示是 Provider 順序或結構問題 |
| `admin/package.json` | 已修改 | Next 15.2.4→15.2.9、@types/react 19.0.12→19.2.14、@types/react-dom 19.0.4→19.2.3 |

---

## 邏輯變更點

### Dockerfile（已完成）

新增一行：
```dockerfile
COPY --from=deps /app/admin/node_modules ./admin/node_modules/
```

原因：npm workspace 將部分套件（autoprefixer、react-icons、react-hot-toast 等 45 個）放在 `admin/node_modules/` 而非根 `node_modules/`，原本的 Dockerfile 只搬根那層導致 webpack 解析失敗。

### not-found.tsx（待診斷）

可能修法（依驗證結果擇一或組合）：
1. 簡化為純靜態結構（移除 `<Link>` 改成原生 `<a href="/">`），避免某個 client provider 的副作用在 prerender 階段參與
2. 若仍失敗 → 檢查 layout.tsx 的 Provider stack（SessionProvider / ThemeProvider / JotaiProvider）是否在 prerender 階段拋錯
3. 最後備案：`export const dynamic = 'force-dynamic'`（讓 not-found.tsx 不參與 prerender，犧牲一些靜態優化但確保 build 過）

---

## 預期測試結果

- [x] `npm run type:check --workspace=admin` 通過
- [ ] `npm run build --workspace=admin` 在本地通過（不會在 prerender 階段噴 React error #31）
- [ ] `docker compose build admin` 成功
- [ ] `docker compose up -d` 後 http://localhost:3010/ 正常顯示
- [ ] http://localhost:3010/不存在的路徑 顯示 not-found 頁

## 風險評估

- 修 not-found.tsx 不影響其他頁面的 prerender
- Dockerfile 改動只是補一行 COPY，回滾風險低
- 若需 fall back 到 `dynamic = 'force-dynamic'`，靜態 404 頁變成 SSR — 對效能影響可忽略（404 流量本來就很少）

## 回滾計劃

1. Revert `admin/Dockerfile` 的新增 COPY 行
2. Revert `admin/src/app/not-found.tsx` 至上一個 commit
3. 視需要 revert `admin/package.json` 的版本升級（但會留下 critical RCE 漏洞）

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者要求「持續修正直到建置成功」，本 Spec 涵蓋升級 Next.js 後出現的一連串 build 失敗的修復路徑。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 修 admin/node_modules 缺漏改 Dockerfile（而非調 npm hoisting） | ✅ 採納 | 動 Dockerfile 是 1 行；動 hoisting 需改 package.json 多個地方且難保所有套件都被 hoist |
| not-found.tsx 修法 | 待定 | 需先做最小複現測試 |

### 產出摘要

實際修復路徑（按時序）：

1. **`@types/react` 重複（19.0.12 vs 19.2.14）** — [admin/package.json](admin/package.json) 升 `@types/react` 19.0.12 → 19.2.14、`@types/react-dom` 19.0.4 → 19.2.3，dedupe 為單一版本（解 ReactNode/ReactPortal 型別衝突）
2. **Next.js critical RCE (CVSS 10)** — [admin/package.json](admin/package.json) 升 `next` / `eslint-config-next` / `@next/bundle-analyzer` 15.2.4 → 15.2.9（修 GHSA-9qr9-h5gf-34mp）
3. **真正根因 — `react@18.3.1` 與 `react@19.0.0` 雙版本共存** — 透過 [package.json](package.json#L34-L37) 新增 `overrides` 強制 `react`/`react-dom` = `19.0.0`，解 `/404` prerender 時 React error #31（root 的 `react-dom-server@18` 渲染 admin 的 `react@19` element 形狀不相容）
4. **`@prisma/client` 6.19.3 vs `prisma` CLI 6.19.2 版本錯配** — 將根 `@prisma/client` 從 `^6.19.2` pin 為 `6.19.2`（精確版本，禁止跳到 6.19.3 導致型別 generation 不一致）
5. **`admin/node_modules` 散落 45 個套件** — 是 (3) 的副作用；React dedupe 後所有套件正常 hoist 到根，原本嘗試補 `COPY --from=deps /app/admin/node_modules` 不再需要，Dockerfile 保留原樣

驗證結果：
- ✅ 本地 `npm run build --workspace=admin` 全部 19 條路由 build 成功
- ✅ `docker compose build admin` 成功
- ✅ `docker compose up -d` 全部容器 healthy
- ✅ migrate + seed（3 roles / 14 permissions / 19 role_permissions / 3 members）成功
- ✅ Next.js 15.2.9 啟動 ready in 114ms
- ✅ `curl -I http://localhost:3010/login` 回 HTTP 200 + 設定 NextAuth csrf/callback cookie

**待補入知識庫**：
- React 雙版本共存 → SSR React #31 的偵測與 npm overrides 修法
- npm workspaces `peer: true` 套件可能 hoist 出非預期版本，需用 overrides 強制
- Prisma CLI 與 @prisma/client 版本必須精確一致（caret 風險）

關鍵教訓（提煉至 Knowledge）：
- npm workspace hoisting 結果**會隨 lock file 重生而改變**；Dockerfile 不應假設 workspace 會永久保留 unhoisted 套件
- Prisma client stub 衝突僅在某些 hoisting 拓撲下發生，hoist 純淨時不會踩到

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/not-found.tsx` — Write @ 2026-04-29 04:06
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/layout.tsx` — Write @ 2026-04-29 04:07
