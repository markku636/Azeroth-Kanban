# 建立技術規格文件（Spec）

為即將進行的改動建立技術規格文件。

> **必須遵循** [`_spec-convention.md`](./_spec-convention.md)

---

## 執行步驟

### Phase 1: 需求收集

1. 詢問改動內容（功能名稱、目的）
2. 掃描工作目錄，自動辨識受影響的子專案（`prisma` / `common` / `admin`）
3. 確認是否有關聯的計劃書（`docs/plans/`）

### Phase 2: 查閱知識庫

掃描 `docs/knowledge/{architecture,patterns,domain,integrations}/`，找出與本次任務相關的既有知識，納入規劃考量。

### Phase 3: 分析受影響檔案

1. 列出所有會被修改或新增的檔案（按子專案分類）
2. 說明具體的邏輯變更點
3. 評估風險與副作用
4. 依固定順序建議開發步驟：`prisma → common → admin`

### Phase 4: 建立 Spec 文件

1. 使用 `docs/specs/_spec-template.md` 模板
2. 在 `docs/specs/doing/` 建立 `{YYYYMMDD}-{NNN}-{task-name}.spec.md`（流水號自動遞增）
3. 填入所有區塊（子專案表格以 `prisma` / `common` / `admin` 填入）
4. 在「背景」區塊引用相關 Knowledge（若有）

### Phase 5: 等待確認

1. 展示 Spec 摘要
2. 詢問使用者是否確認
3. 確認後才開始開發
