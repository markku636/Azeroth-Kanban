# Keycloak Realm — Azeroth Kanban

本資料夾包含預先配置的 Keycloak Realm，用於 Kanban 看板的 OIDC 認證。

## 預設配置

- **Realm**: `kanban`
- **Client**: `kanban-admin`（confidential，OIDC Authorization Code Flow）
- **Client Secret**: `kanban-admin-secret`（明文存放於 `realm-export.json`，**僅限本地 Demo 使用**）
- **Roles**: `admin` / `user` / `viewer`
- **預設使用者**：

| Email | 密碼 | Role |
| --- | --- | --- |
| `admin@example.com` | `Admin@1234` | `admin` |
| `user@example.com` | `User@1234` | `user` |
| `viewer@example.com` | `Viewer@1234` | `viewer` |

## 啟動方式

### 方式 1：透過 docker-compose（推薦）

```bash
docker compose up -d keycloak postgres
```

Keycloak 會在啟動時自動 `--import-realm`，將 `realm-export.json` 載入。
完成後可透過 [http://localhost:8080](http://localhost:8080) 進入 Keycloak Admin Console（帳號 / 密碼：`admin / admin`，由 docker-compose env 控制）。

### 方式 2：手動匯入（已有 Keycloak）

1. 進入 Admin Console → Realm 下拉選單 → "Create Realm"
2. 點擊 "Browse..." 上傳 `keycloak/realm-export.json`
3. "Create"

## 重置 Realm

`start-dev --import-realm` 只在資料目錄無此 realm 時匯入；若改了 `realm-export.json` 想重新套用：

```bash
docker compose down -v   # 注意：會清掉 postgres 資料！
docker compose up -d
```

或保留 postgres，僅清 keycloak：

```bash
docker compose rm -fsv keycloak
docker volume rm kanban_keycloak_data 2>/dev/null || true
docker compose up -d keycloak
```

## 安全提醒（重要）

- ⚠️ **`realm-export.json` 內 client secret 為明文**，不可用於 production
- 預設使用者密碼非高強度，僅供 Demo
- 進 production 前需要：
  1. 移除預設使用者或改密碼
  2. 改用 Keycloak Admin API 動態建立 client secret
  3. 啟用 HTTPS 與 production hostname

## 擴增使用者

1. 進入 Admin Console → Users → "Add user"
2. 填入 username / email，"Create"
3. 切到 "Credentials" 分頁，設定密碼（記得關閉 "Temporary"）
4. 切到 "Role mapping" 分頁，指派 `admin` / `user` / `viewer` 任一個 realm role
5. 使用者首次登入 Kanban admin 時，會自動 upsert 至 `members` 資料表（以 `keycloak_sub` 為鍵）
