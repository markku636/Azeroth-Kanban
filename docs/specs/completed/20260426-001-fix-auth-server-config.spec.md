# Spec: 修正 NextAuth server config 錯誤（Keycloak gating + .env port 對齊）

> 建立日期: 2026-04-26
> 狀態: ✅ 已完成
> 關聯計劃書: 無（生產環境級的 config bug，使用者操作時即時回報）

---

## 目標

修復登入時跳出「There is a problem with the server configuration」錯誤頁，並讓帳密登入（admin/user/viewer）可正常使用。

## 背景

兩個獨立但同時生效的設定錯誤：

1. **`admin/src/auth.ts:62-68`** 無條件註冊 `KeycloakProvider`：
   ```ts
   const providers: Provider[] = [
     KeycloakProvider({
       clientId: process.env.AUTH_KEYCLOAK_ID,        // undefined
       clientSecret: process.env.AUTH_KEYCLOAK_SECRET, // undefined
       issuer: process.env.AUTH_KEYCLOAK_ISSUER,       // undefined
     }),
   ];
   ```
   本機 `admin/.env` 沒設這三個變數，Auth.js 初始化時驗證 OAuth provider config → 直接拋 server config error，整個 `/api/auth/*` 都變 500。

2. **`admin/.env` `NEXTAUTH_URL=http://localhost:3010`** 跟實際 dev server port 不符：
   - `admin/package.json` 的 dev 腳本是 `next dev --port 3011 --turbo`
   - 本機 3010 已被 Docker Desktop 後端佔用
   - 即使 #1 修好，NextAuth 看到 callback URL 與實際 origin 不符仍會拒絕請求

3. **`admin/.env` 缺 `AUTH_ALLOW_CREDENTIALS=true`** → `auth.ts:8` 的 `ALLOW_CREDENTIALS` 為 false → 連 Credentials provider 都不註冊 → 帳密登入完全沒這個 endpoint

> 參考知識：本專案 `auth.ts` 已正確設計「Credentials 走 ALLOW_CREDENTIALS env gate」的模式，但 KeycloakProvider 沒套同樣模式，是缺漏。本 Spec 把 Keycloak 也補上同樣的 env gate。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | `auth.ts` + `.env` |

---

## 受影響檔案

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/auth.ts` | 修改 | KeycloakProvider 改成「三個 env 都齊全才註冊」 |
| `admin/.env` | 修改 | `NEXTAUTH_URL` 改 3011；新增 `AUTH_ALLOW_CREDENTIALS=true` |

---

## 邏輯變更點

### `admin/src/auth.ts`

把無條件 array 初始化改為條件 push：

```ts
const providers: Provider[] = [];

if (
  process.env.AUTH_KEYCLOAK_ID &&
  process.env.AUTH_KEYCLOAK_SECRET &&
  process.env.AUTH_KEYCLOAK_ISSUER
) {
  providers.push(
    KeycloakProvider({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
    })
  );
}

if (ALLOW_CREDENTIALS) { /* unchanged */ }
```

### `admin/.env`

```
NEXTAUTH_URL=http://localhost:3011        # was 3010
AUTH_ALLOW_CREDENTIALS=true               # newly added
```

無 DB / API schema 變更。

## 預期測試結果

- [ ] 重啟 dev server 後 `/admin/login` 不再跳 server config 錯誤
- [ ] 點「快速填入 Admin」→ 按「登入」可成功登入並導到 `/admin`
- [ ] User / Viewer 同樣可以登入
- [ ] 沒設 Keycloak env 時 `/api/auth/signin/keycloak` 不存在（404）→ 正確行為
- [ ] `npm run type:check` 通過

## 風險評估

- `.env` 為 dev 環境設定，不影響生產（生產用 docker-compose / k8s helm 的 env）
- KeycloakProvider gating 是「向後相容」改動：環境變數齊全時行為與原本完全一致；不齊全時從「整個 auth crash」改為「只是少一個登入選項」，比現狀更安全

## 部署影響

- 生產環境需確認 docker-compose / helm chart 有設 KEYCLOAK 三個變數（如果 Keycloak SSO 在生產要可用）。本 Spec 不動 docker-compose，僅修 dev 行為與 server-side gating

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄

### 目標確認

使用者於登入時看到 `ClientFetchError: There was a problem with the server configuration`。截圖顯示 `localhost:3011/api/auth/error`，證實 dev server 在 3011 但 NEXTAUTH_URL 設 3010。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| KeycloakProvider 加 env gate | ✅ 採納 | 對齊 Credentials provider 已有的 `ALLOW_CREDENTIALS` env gate 模式 |
| 改 `NEXTAUTH_URL` 至 3011 | ✅ 採納 | 對齊 `admin/package.json` dev 腳本 `--port 3011` |
| 改 dev script port 至 3010、釋放 docker | ❌ 棄用 | 3010 是 Docker Desktop 後端，不可動 |
| 動 docker-compose 把 admin 容器 port 也改 3011 | ❌ 棄用 | 超出本 Spec scope，且 docker 內部與本機 dev 端口本來就可獨立 |
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/auth.ts` — Edit @ 2026-04-25 16:22
