# Snyk 手動資安漏洞掃描

> 建立日期: 2026-04-29
> 狀態: ✅ 已完成
> 關聯計劃書: 無（中型 Spec，無 Plan）

---

## 目標

提供本地手動執行的 Snyk 掃描指令，涵蓋三類掃描：
- **依賴漏洞 (SCA)** — `package.json` / `package-lock.json` 的 CVE
- **IaC** — `docker-compose.yml` 的設定風險
- **Container** — 第三方 base image（postgres、keycloak）的 CVE

不做 CI 整合（依使用者要求）。

## 背景

- `npm audit` 目前共回報 12 個漏洞（2 low / 5 moderate / 5 high），剛修完 CVSS 10 critical（Next.js RCE，15.2.4 → 15.2.9）
- 使用者要求**手動跑**即可，不需 GitHub Actions / weekly cron
- Snyk 比 `npm audit` 多兩個維度（IaC 與 Container），值得補上

> 參考知識：
> - `docs/knowledge/architecture/20260425-001-monorepo-workspace-layout.md` — npm workspaces 結構，掃描需用 `--all-projects` 涵蓋 `common/` + `admin/` 兩個 workspace 的 lockfile

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | — |
| `common` | ❌ | — |
| `admin` | ❌ | — |
| **專案根** | ✅ | 修改根 `package.json` 加 `security:*` npm scripts |

---

## 受影響檔案

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `package.json` | 修改 | 新增 `security:deps` / `security:iac` / `security:container` / `security:all` / `security:report` scripts |
| `README.md` | 修改 | 補充「資安掃描」章節（首次取得 token 步驟、各指令用途） |

> 不新增 `.github/workflows/security-scan.yml`（使用者明確要求手動）。
> 不新增 `.snyk` 政策檔（手動模式下無需固定忽略規則；要忽略時當下加 `--policy-path`）。

---

## 邏輯變更點

### `package.json`（修改根）— 新增 scripts

```json
"security:deps":      "npx -y snyk@latest test --all-projects --severity-threshold=high",
"security:iac":       "npx -y snyk@latest iac test docker-compose.yml",
"security:container": "npx -y snyk@latest container test postgres:16-alpine quay.io/keycloak/keycloak:26.0",
"security:all":       "npm run security:deps && npm run security:iac && npm run security:container",
"security:report":    "npx -y snyk@latest test --all-projects --json-file-output=.tmp/snyk-report.json"
```

設計重點：
- **不**將 `snyk` 列為 devDependency — 套件大、變動快，`npx -y snyk@latest` 即用即取乾淨
- `--all-projects` 涵蓋 monorepo 多個 workspace 的 lockfile
- `--severity-threshold=high` — 一般跑只看 high+critical，避免 moderate 雜訊；要看全部時 dev 自行加 `-- --severity-threshold=low`
- `security:report` 把 JSON 結果寫到 `.tmp/snyk-report.json`，供事後分析或貼進工單

### `README.md`（修改）— 新增「資安掃描」章節

涵蓋：
1. **首次設定**：到 https://app.snyk.io/account 取 API token → `npx -y snyk@latest auth`
2. **常用指令**：
   - `npm run security:deps` — 掃 npm 依賴（最常用）
   - `npm run security:iac` — 掃 docker-compose
   - `npm run security:container` — 掃 base image
   - `npm run security:all` — 三類一起跑
   - `npm run security:report` — 輸出 JSON 報告
3. **何時該跑**：`npm install` 引入新套件後 / 升級套件版本後 / 上版前 quick check

---

## 預期測試結果

- [ ] `npm run security:deps` 能輸出已知漏洞清單（至少對應目前 `npm audit` 的 5 high）
- [ ] `npm run security:iac` 能掃出 docker-compose.yml 的潛在問題（如 Postgres 預設密碼為常數、無 read-only 設定等）
- [ ] `npm run security:container` 能掃出 `postgres:16-alpine` / `quay.io/keycloak/keycloak:26.0` 的已知 base image CVE
- [ ] `npm run security:all` 三步全跑、任一失敗會中止（&& 串接）
- [ ] `npm run security:report` 在 `.tmp/snyk-report.json` 產生 JSON 檔
- [ ] README 章節寫得讓新人直接照做就能跑起來

## 風險評估

- **首次跑需網路 + token**：開發者首次執行前必須 `npx snyk auth`，沒做會 prompt 失敗 — 已在 README 說明
- **Snyk 免費版 quota**：200 tests/月，手動跑遠低於上限，無風險
- **JSON 報告路徑**：`.tmp/` 為慣例暫存目錄，需確保 `.gitignore` 已忽略（已有 `.tmp` rule，無需新增）
- **IaC scan 對 docker-compose 的覆蓋**：Snyk IaC 對 docker-compose 的支援不如 K8s manifest 完整，可能 false negative；不影響 SCA 主用途

## 回滾計劃

1. 從根 `package.json` 移除 `security:*` scripts
2. 移除 README 「資安掃描」章節

無 DB / API / 程式碼邏輯變更，回滾零風險。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者要求對 Kanban 專案做 Snyk 資安掃描。原本規劃 CI 整合（PR + push + weekly cron），使用者中途改要求「手動跑就好」，已縮小範圍至本地 npm scripts + README。

### 關鍵問答

#### Q1: 為何不做 CI 整合？

**AI 回應摘要**: 使用者明確要求手動。手動模式優點：免設 GitHub secret、免擔心免費版 quota 撞牆、PR 不會被 false positive 擋住；缺點：需開發者自律記得跑。對面試作業 / 小型專案規模 OK。

#### Q2: 是否要納入 Snyk Code (SAST)？

**AI 回應摘要**: 暫不納入。SAST 對 TypeScript 專案 false positive 較多，且部分需付費功能；本期只做 SCA + IaC + Container。

#### Q3: snyk CLI 該裝為 devDependency 嗎？

**AI 回應摘要**: 不裝。套件大（~50MB）、版本變動快，`npx -y snyk@latest` 即用即取最乾淨，避免 lockfile 被 snyk 的傳遞依賴污染。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 手動跑而非 CI 整合 | ✅ 採納 | 使用者明確要求 |
| `severity-threshold=high` 為預設 | ✅ 採納 | 避免 moderate 雜訊；要看全部時 dev 用 `--` 加 flag |
| 用 `npx -y snyk@latest` 而非裝 devDependency | ✅ 採納 | 避免每次 `npm ci` 多拉 ~50MB；snyk CLI 自身常更新 |
| 納入 Snyk Code (SAST) | ❌ 棄用 | TS false positive 多、需付費功能；本期先做 SCA + IaC + Container |
| 寫 GitHub Actions workflow | ❌ 棄用 | 使用者改要求手動模式 |
| 建 `.snyk` 政策檔 | ❌ 棄用 | 手動模式下無常駐 ignore 需求 |

### 產出摘要

- [package.json:21-25](package.json#L21-L25) — 新增 5 個 `security:*` npm scripts（deps / iac / container / all / report）
- [README.md:190-228](README.md#L190-L228) — 新增「資安掃描（Snyk）」章節：首次設定、5 個常用指令、何時該跑、客製 severity threshold
- 採用 `npx -y snyk@latest`（即用即取，不裝 devDependency，避免 ~50MB 套件污染 lockfile）
- 預設 `--severity-threshold=high` 過濾 moderate 以下雜訊
- 已驗證：`npm run` 列出 5 個 security scripts 正確登記

剩餘漏洞（Snyk 後續可掃）：2 low / 5 moderate / 5 high — 主要在 `effect`（@prisma/config 傳遞依賴）、`lodash`、`dompurify`（swagger-ui-react 傳遞）、`postcss`、`uuid`（@hookform/devtools 傳遞）。多數需等上游套件修復或主動升級 swagger/devtools major 版。
