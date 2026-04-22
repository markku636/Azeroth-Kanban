# docs/requirements/

產品需求文件（PRD）存放區。

## 用途

**大型需求**且**口述模糊**時的前置收斂階段。AI 依使用者口述產生 PRD 初稿，與使用者反覆迭代至 ✅ 已確認後，才進入對應 Plan 的撰寫。

## 何時建立 PRD（全部成立才啟動）

1. 規模判斷為**大型**（新功能 / 跨多子專案 / 架構變更）
2. 使用者需求**口述且不完整**（有明顯待釐清點、多項開放問題）
3. 使用者未表達豁免意圖（關鍵字：「不用 PRD」「跳過 PRD」「直接 Plan」「直接做」「不需要文件」「先做個簡單的」「快速做一下」）
4. 無既有 ✅ PRD（掃描 `doing/` 與 `completed/`）

任一不成立 → 跳過 PRD，直接走 Plan / Spec。

## 目錄結構

```
docs/requirements/
├── _prd-template.md       ← PRD 模板
├── doing/                 ← 🟡 討論中（AI 新建 PRD 置於此，與使用者反覆迭代）
└── completed/             ← ✅ 已確認歸檔（由 SessionEnd Hook 自動搬移）
```

## 命名慣例

`{YYYYMMDD}-{NNN}-{kebab-topic}.md`（日期 + 3 位流水號 + kebab-case 描述）

## 生命週期

1. AI 依使用者口述產生 PRD 初稿於 `doing/`，狀態 🟡 討論中，列出開放問題
2. 使用者逐題回覆，AI 更新 PRD 並追加「變更紀錄」
3. 使用者確認 → 狀態改為 ✅ 已確認
4. SessionEnd Hook 自動將 ✅ 的 PRD 歸檔至 `completed/`
5. AI 才建立對應 Plan，Plan 首段引用 `docs/requirements/completed/{檔名}.md`

## 與 Plan 的關係

**1 PRD ↔ 1 Plan**。PRD 範圍內若需多階段交付，由 Plan 的 WBS 與 Spec 清單拆解，PRD 不拆分。

硬性規則：**PRD 建立後未 ✅ 前，AI 不得建立對應 Plan**。
