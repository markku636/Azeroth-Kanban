# Spec-before-Code 強制規則（含全文件生命週期自動撰寫）

> 此檔案**只定義工作流規則**。程式碼層級的命名、型別、async、React、安全性、錯誤處理等慣例，請參閱 [`./coding-standards.md`](./coding-standards.md)。
> 兩份規則共同構成本專案的 AI 協作標準，彼此互補、不重疊。

## 核心原則

在對程式碼檔案執行 Edit 或 Write 之前，必須先產生對應的 Plan/Spec 文件並取得使用者確認。
這是硬性規則，AI 必須自主遵守，不需使用者額外指示。

---

## 一、攔截規則 — Edit/Write 前的檢查流程

任何超過 3 行的程式碼改動，執行 Edit/Write 前必須依序檢查：

### Step 0: 判斷規模 — 決定需要 Plan 還是只需 Spec

| 規模 | 判斷條件 | 需要的文件 |
| --- | --- | --- |
| **大型** | 新功能 / 跨多子專案 / 涉及架構變更 / 需要多份 Spec | Plan + Spec(s) |
| **中型** | 改動 3+ 檔案但範圍明確 / 單一子專案內的增改 | 僅 Spec |
| **小型** | ≤ 3 行改動 / typo / 設定值 / 格式化 | 豁免，直接改 |

### Step 0.5: 查閱知識庫（每次規劃前必做）

掃描 `docs/knowledge/` 各子目錄，重點查閱：
- `architecture/` — 是否有相關模組架構、資料流、系統邊界記錄？
- `patterns/` — 此類功能是否有已確立的 coding pattern 或慣例？
- `domain/` — 是否有相關業務規則需要遵循？
- `integrations/` — 是否有已知的 API 整合踩坑或第三方服務注意事項？

執行動作：
1. 若找到相關知識 → 在 Plan/Spec 的「背景」區塊引用來源（格式：`> 參考知識：docs/knowledge/{category}/{file}.md`）
2. 若有 DB 相關知識（schema 設計、migration 踩坑）→ 在資料表異動區塊中標注已知風險
3. 若無相關知識 → 繼續下一步（不需額外操作）

### Step 1: 檢查 Plan（僅大型需求 / 有參考資料時）
- 該功能是否已有 Plan？（單檔 `{YYYYMMDD}-{NNN}-{feature}.md` 或資料夾 `{YYYYMMDD}-{NNN}-{feature}/plan.md`）
- **有參考資料**（`references/` 目錄存在）→ AI 必須先讀取 `references/` 內所有檔案（`.pdf`、`.md`、`.sql`、`.txt`），再產生或更新 `plan.md`，並在「參考資料」區塊列出每個檔案的摘要
- **沒有 Plan** → 查閱 Knowledge 後，自動建立 Plan 至 `doing/`（用 `_plan-template.md`），展示摘要，等使用者確認
- **有且已確認** → 進入 Step 2
- **中型需求**（且無參考資料）→ 跳過此步驟，直接進入 Step 2

### Step 2: 檢查 Spec
- 該任務是否已有 `docs/specs/doing/{YYYYMMDD}-{NNN}-{task}.spec.md`？
- **沒有** → 查閱 Knowledge 後，自動建立 Spec 至 `doing/`（用 `_spec-template.md`），檔名使用日期流水號格式，展示摘要，等使用者確認
- **有且已確認（🔵 開發中）** → 放行 Edit/Write

### Step 3: 寫入開發日誌
- 首次對該任務執行 Edit/Write 時，自動追加一條記錄到 `docs/logs/`

---

## 二、開發過程中的自動撰寫

### 遇到 Bug 時
1. 自動記入當前 Spec 的 Bug Log 區塊
2. 若該 Bug 有跨專案或通用參考價值 → 自動建立 `docs/bugs/doing/{YYYYMMDD}-{NNN}-{bug-name}.md`（用 `_bug-template.md`）

### 開發日誌追加時機
AI 在以下事件發生時，自動追加記錄到 `docs/logs/{YYYYMMDD}-{NNN}-{topic}.md`：
- 開始開發某個 Spec
- 做出重要技術決策或方案變更
- 遇到預期外的問題（踩坑）
- 完成一個里程碑或任務

---

## 三、完成時的自動歸檔

任務完成後，AI 自動執行：
1. 將 Spec 狀態改為 ✅ 已完成（仍在 `doing/`，由 SessionEnd Hook 自動歸檔至 `completed/`）
2. 將相關 Bug 狀態改為 ✅ 已修復（同上，由 Hook 歸檔）
3. 更新 Plan 中的 Spec 清單進度
4. 若 Plan 的所有 Spec 都完成 → Plan 狀態改為 ✅ 已完成（由 Hook 歸檔）
5. 追加一條「完成」記錄到 `docs/logs/`
6. **提煉知識**（見下方第三之一節）

> **SessionEnd Hook 歸檔**：Session 結束時，Hook 自動掃描 `doing/` 資料夾，將所有標記為 ✅ 的文件移至對應的 `completed/`。
> **Knowledge 不受 Hook 歸檔影響**：`docs/knowledge/` 為永久知識庫，不走 `doing/completed/` 流程。

---

## 三之一、知識提煉（Knowledge Extraction）

任務完成時，AI 自動判斷是否有可複用的知識值得提煉：

### 觸發時機
- Spec 標記為 ✅ 已完成時
- Bug 修復完成且具有通用價值時

### 判斷標準（AI 自主判斷）
AI 檢視完成的 Spec（含 Bug Log）與相關 Bug，評估以下面向：
- **架構知識**：是否發現了模組關係、資料流、系統邊界等值得記錄的架構洞察？ → `docs/knowledge/architecture/`
- **開發模式**：是否建立了新的 coding pattern、慣例、最佳實踐？ → `docs/knowledge/patterns/`
- **業務領域**：是否釐清了商業規則、領域邏輯、業務流程？ → `docs/knowledge/domain/`
- **整合知識**：是否有 API 串接、第三方服務整合的經驗值得記錄？ → `docs/knowledge/integrations/`

### 執行規則
1. **先檢查既有知識**：掃描 `docs/knowledge/` 各子目錄，確認是否已有相關主題的文件
2. **有相關文件 → 更新**：在既有文件中追加或修訂內容，而非建立新文件
3. **無相關文件 → 新建**：使用 `docs/knowledge/_knowledge-template.md` 模板，放入對應分類目錄
4. **無可複用知識 → 跳過**：不是每次完成都需要提煉，AI 應判斷是否真有價值
5. **命名格式**：`{YYYYMMDD}-{NNN}-{topic}.md`（與其他文件同一命名慣例）
6. **永久保留**：Knowledge 文件不走 `doing/completed/` 生命週期，直接放入分類目錄

### Knowledge 與其他文件的關係
- Knowledge 從 Spec 和 Bug 中**提煉**而來，但獨立存在
- Spec Bug Log 記錄的是「這次開發遇到什麼」，Knowledge 記錄的是「未來可複用的通則」
- 一個 Spec 可能產生零到多個 Knowledge 文件（跨多個分類）

### 規劃時查閱 Knowledge
- AI 在建立 Plan 或 Spec 前，必須先掃描 `docs/knowledge/` 查找相關既有知識
- 將相關知識納入規劃考量，避免重複踩坑或違反已知慣例
- 在 Plan/Spec 的「背景」區塊引用相關 Knowledge 來源

---

## 四、跨專案改動（額外規則）

若改動涉及多個子專案（`prisma` / `common` / `admin`）：
- Plan 與 Spec 必須包含「受影響子專案」表格
- 開發順序固定為：`prisma` → `common` → `admin`
- 每個子專案的受影響檔案必須分開列出

---

## 五、豁免條件

以下不需建 Plan/Spec，可直接 Edit/Write：
- 修正 typo、更新版本號、修改設定值、純格式化調整
- 僅修改一行的小幅調整
- 修改設定檔（`.json`, `.yaml`, `.toml` 等）或文件檔（`.md`）
- 使用者明確說「直接改」「不用寫 plan」「hotfix」

## 六、判斷程式碼檔案的副檔名

以下副檔名視為程式碼檔案，受此規則攔截：
`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.cs`, `.go`, `.java`, `.rb`, `.rs`, `.cpp`, `.c`, `.h`, `.swift`, `.kt`, `.vue`, `.svelte`, `.php`

Prisma schema（`*.prisma`）與 SQL migration 檔同樣視為程式碼檔案，受攔截。

---

## 七、AI 協作紀錄（Collaboration Log）

AI 在開發過程中**自動維護** Plan/Spec 的「AI 協作紀錄」區塊，提供可追溯的思考脈絡與技術取捨。

### 7.1 目標確認（建立 Plan/Spec 前）

在建立 Plan 或 Spec 前，AI 必須：
1. 向使用者確認本次對話想解決的問題
2. 以一句話描述目標，填入「AI 協作紀錄 > 目標確認」

### 7.2 關鍵問答記錄（對話進行中）

AI 自動記錄以下類型的問答到「AI 協作紀錄 > 關鍵問答」：
- 涉及技術選型的討論
- 影響架構的決策點
- 使用者對方案的質疑或確認

格式：問題摘要 + AI 回應摘要（不需完整對話，保留思考脈絡即可）

### 7.3 決策記錄（有取捨時）

當 AI 提出方案但使用者**不採納**時，AI 必須：
1. 在「AI 協作紀錄 > 決策記錄」表格追加一行
2. 標記 ❌ 棄用，記錄使用者說明的原因（或 AI 推斷的原因）

當使用者**採納**某方案時，同樣追加一行標記 ✅ 採納。

### 7.4 產出摘要（任務完成時）

任務完成後，AI 自動在「AI 協作紀錄 > 產出摘要」填入：
- 重要程式碼片段或設計思路
- 測試案例（若有）
- 更新的文件清單

> 此區塊與 Knowledge 互補：產出摘要記錄「這次做了什麼、取捨了什麼」，Knowledge 記錄「未來可複用的通則」。
