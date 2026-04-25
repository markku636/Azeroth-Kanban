# NextAuth v5 + Keycloak SSO，搭 Credentials Fallback 雙 Provider

> 建立日期: 2026-04-25
> 分類: integrations
> 來源 Spec: `docs/specs/completed/20260425-001-keycloak-auth-and-deployment.spec.md`
> 來源 Bug: 無

---

## 背景

PRD 把預設認證改為 Keycloak OIDC，但仍要保留「單機 Demo / 演示時 Keycloak 還沒起來」的本地帳密 fallback。NextAuth v5 (Auth.js) 同時掛兩個 Provider，並用 env 開關控制 Credentials 是否啟用，實作上有幾個非顯而易見的細節（issuer URL、`signIn` callback upsert、Member ↔ Keycloak `sub` 對應）。

## 知識內容

### 整體架構

```
┌─────────────┐  signIn('keycloak')  ┌──────────────┐
│ Login Page  │ ───────────────────► │  Keycloak    │
│ (按鈕)      │                      │  /realms/... │
└─────────────┘                      └──────┬───────┘
       │                                    │ OAuth2/OIDC
       │ signIn('credentials')             │
       │ (fallback, env-gated)              │
       ▼                                    ▼
┌────────────────────────────────────────────────────┐
│  NextAuth v5 callbacks                             │
│  - signIn(): upsert Member by keycloakSub          │
│  - jwt():    把 memberId / role 塞進 token         │
│  - session():把 token 字段攤到 session.user        │
└────────────────────────────────────────────────────┘
              │
              ▼
       Member table（DB）
       - keycloakSub (UNIQUE, NULL allowed)
       - password (NULL allowed)
```

### 關鍵設計決策

#### 1. 雙 Provider，env 開關控制 Credentials

Provider 陣列**動態組合**，預設只有 Keycloak：

```ts
import KeycloakProvider from 'next-auth/providers/keycloak';
import CredentialsProvider from 'next-auth/providers/credentials';

const providers = [
  KeycloakProvider({
    clientId: process.env.AUTH_KEYCLOAK_ID!,
    clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
    issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
  }),
];

if (process.env.AUTH_ALLOW_CREDENTIALS === 'true') {
  providers.push(
    CredentialsProvider({
      name: 'credentials',
      credentials: { username: {}, password: {} },
      async authorize(creds) {
        // bcrypt.compare(...) → return Member 或 null
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({ providers, callbacks: {...} });
```

理由：(1) Keycloak 還沒起來時可臨時打開做 demo；(2) `prisma/seed.ts` seed 了 3 個 bcrypt 帳號，移除 Provider 會讓帳號變 dead data。

#### 2. Member ↔ Keycloak `sub` 對應：用 `keycloakSub` 單欄而非 join 表

Member 加 unique 欄位 `keycloakSub`（NULL allowed）：

```prisma
model Member {
  id          String  @id @default(cuid())
  email       String  @unique
  password    String? // 改 nullable，Keycloak 接管後可為 NULL
  keycloakSub String? @unique @map("keycloak_sub")
  role        String?
  // ...
}
```

理由：一個 Member 對應一個 Keycloak `sub`，用單欄 unique index 即可，KISS。如果未來需要多 IdP，再考慮 `MemberKeycloakLink` join 表。

#### 3. `signIn` callback 自動 upsert Member

Keycloak 認證成功後，NextAuth 觸發 `signIn` callback。在這裡 upsert Member（依 `profile.sub`），並從 `realm_access.roles` 挑出單一 role 寫入 DB：

```ts
async signIn({ user, account, profile }) {
  if (account?.provider !== 'keycloak') return true;

  const sub = profile?.sub as string;
  if (!sub) return false;

  // 從 Keycloak realm roles 中挑「最強」的單一 role
  const realmRoles = (profile?.realm_access as { roles?: string[] })?.roles ?? [];
  const role = realmRoles.includes('admin') ? 'admin'
             : realmRoles.includes('user')  ? 'user'
             : realmRoles.includes('viewer') ? 'viewer'
             : null;

  await prisma.member.upsert({
    where:  { keycloakSub: sub },
    update: { email: profile.email!, name: profile.name!, role },
    create: { email: profile.email!, name: profile.name!, role, keycloakSub: sub, isActive: true },
  });
  return true;
}
```

#### 4. `jwt` callback 第一次塞進 `memberId / role`，後續不重查

```ts
async jwt({ token, account, profile }) {
  if (account?.provider === 'keycloak' && profile?.sub) {
    const member = await prisma.member.findUnique({ where: { keycloakSub: profile.sub as string } });
    if (member) {
      token.memberId = member.id;
      token.role = member.role;
    }
  }
  return token;
}
```

避免每次 request 都打 DB；session 過期或角色變更要 sign out + sign in 才會重抓。

### Docker / Keycloak issuer 對應「容器內 vs 瀏覽器」陷阱

Keycloak 的 issuer URL 必須在 **admin 容器內** 與 **host 上的瀏覽器** 都能解析到同一個 hostname；否則「容器內 token verify 用的 issuer」與「瀏覽器拿到的 redirect」對不起來，登入失敗。

**解法**：用 `host.docker.internal` 作為 canonical hostname。

`docker-compose.yml`：

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    command: start-dev --import-realm
    environment:
      KC_HOSTNAME: host.docker.internal   # 容器與 host 都解析到同一名
      KC_HEALTH_ENABLED: 'true'
    ports: ['8080:8080']
    volumes: ['./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json:ro']

  admin:
    extra_hosts:
      - 'host.docker.internal:host-gateway'   # Linux 必加，Mac/Win 自動有
    environment:
      AUTH_KEYCLOAK_ISSUER: 'http://host.docker.internal:8080/realms/kanban'
      NEXTAUTH_URL: 'http://localhost:3010'
```

### Realm import 重新匯入時序

`start-dev --import-realm` **只在 data dir 沒有此 realm 時才匯入**。改 `realm-export.json` 後若想生效：

```bash
docker compose down -v   # -v 清掉 keycloak volume
docker compose up -d
```

### entrypoint.sh：等 Postgres → migrate → seed → start

`admin/entrypoint.sh`：

```sh
#!/bin/sh
set -e
until nc -z postgres 5432; do sleep 1; done
npx prisma migrate deploy --schema=./prisma/schema.prisma
npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped"
exec node admin/server.js
```

注意：

- 用 `migrate deploy`（生產模式）而非 `migrate dev`（會建 shadow DB）
- seed 必須 idempotent（用 `upsert`），fail 也不要 `set -e` 中止啟動
- Dockerfile runner stage 要裝 `tsx`、`prisma` CLI、`busybox-extras`（提供 `nc`）

## 適用場景

- Next.js 15 / NextAuth v5 + Keycloak / Auth0 / 任何 OIDC IdP 整合
- 需要保留本地帳密 fallback 用於 demo / E2E test 的場景
- 跨 Docker 容器 + host 瀏覽器的 OIDC issuer URL 配置
- 自動 upsert IdP user 至本地 DB 的 SSO 流程

## 注意事項

- **`AUTH_KEYCLOAK_ISSUER` 必須是「完整 issuer URL」**，包含 `/realms/{realm}` 部分；NextAuth 會自動加 `/.well-known/openid-configuration` 取 metadata。
- **realm-export.json 的 client secret 是明文**，不適合 production。本專案僅用於 demo，README 已警告。
- **Linux extra_hosts**：`host-gateway` 是 docker-compose v3.x+ 語法，舊 Docker 不支援，需手動 `127.0.0.1 host.docker.internal` 寫入容器內 `/etc/hosts`。
- **Email 衝突未處理**：若同一 email 既存於本地（password 帳號）又透過 Keycloak 第一次登入，會建立**新 row** 而非合併。本案規模可接受；production 需設計 email 衝突合併策略（按 PRD 與商務決策走）。
- **`AUTH_TRUST_HOST=true`** 在容器環境必設，否則 NextAuth v5 會擋來源不符的 callback。

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-04-25: 初次建立，來源 Spec A（20260425-001-keycloak-auth-and-deployment）
-->
