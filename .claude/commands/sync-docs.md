# 同步指引文件（README.md / CLAUDE.md）

掃描當前專案的資料夾結構、技術棧、`.claude/commands/`、`.claude/rules/`、`.claude/skills/` 的所有檔案，比對現有 `README.md` 與 `CLAUDE.md`，補上缺漏、更新過時描述。

> **本指令屬於文件維護，不受 `spec-before-code.md` 攔截**。Markdown 檔案為豁免範圍。

---

## 執行步驟

### Phase 1: 掃描現況

1. 列出專案根目錄與 `admin/`、`common/`、`prisma/` 的目錄結構
2. 讀取 `package.json`、`docker-compose.yml`、`prisma/schema.prisma` 取得技術棧資訊
3. 列出 `.claude/commands/` 所有 `.md` 檔（忽略 `_` 開頭的 convention/template）
4. 列出 `.claude/rules/` 所有 `.md` 檔
5. 列出 `.claude/skills/` 所有 `.md` 檔
6. 讀取現有 `README.md` 與 `CLAUDE.md`

### Phase 2: 比對差異

比對下列項目：
- **目錄結構**：新增的資料夾是否已記錄
- **技術棧**：新增/升級的套件是否已更新
- **常用指令**：`package.json scripts` 新增的指令是否已收錄
- **Claude Code 設定**：`.claude/` 底下的 commands / rules / skills 是否全部列出且描述正確
- **目錄表**：`docs/` 目錄結構是否同步

### Phase 3: 更新文件

1. **僅補缺漏與過時項**，不刪除或覆蓋使用者自訂內容
2. 保留現有格式與語氣（中文、表格、emoji 使用方式）
3. 對 `CLAUDE.md`，優先維護：
   - 目錄結構
   - 技術棧表格
   - 常用指令表格
   - 「Claude Code 設定」區塊（commands / rules / skills 表格）
4. 對 `README.md`，優先維護：
   - 功能目標
   - 技術選型表格
   - 安裝與啟動步驟
   - 專案結構

### Phase 4: 回報

以條列方式列出：
- 新增了哪些條目
- 更新了哪些描述
- 未更動但建議使用者檢視的區塊（若有）
