# 同步 Agent Skill 文件

掃描當前專案的程式碼結構、`.claude/commands/`、`.claude/rules/`，比對 `.claude/skills/` 底下現有技能文件，補上缺漏、更新過時描述。

> **本指令屬於文件維護，不受 `spec-before-code.md` 攔截**。Markdown 檔案為豁免範圍。

---

## 執行步驟

### Phase 1: 掃描現況

1. 列出所有子專案的頂層資料夾：`admin/src/**`、`common/src/**`、`prisma/`
2. 讀取 `package.json` 取得 workspaces 結構
3. 列出 `.claude/commands/`、`.claude/rules/` 所有檔案
4. 讀取 `.claude/skills/` 所有現有技能文件

### Phase 2: 比對差異

檢查下列項目：
- **專案架構總覽**：子專案職責與技術棧是否仍正確
- **模組關聯性**：依賴方向與開發順序（`prisma` → `common` → `admin`）是否同步
- **Skill 步驟**：各 Skill 的步驟是否仍符合 `spec-before-code.md` 流程
  - 有無遺漏「查閱知識庫」步驟
  - 有無遺漏「自動建立 Plan/Spec」攔截點
  - 檔名格式 `{YYYYMMDD}-{NNN}-{name}` 是否一致
- **Commands / Rules 引用**：Skill 文件是否引用到已刪除或新增的 command/rule
- **範例 Prompt**：常見任務範例是否仍對應現狀

### Phase 3: 更新文件

1. **僅補缺漏與過時項**，不刪除或覆蓋使用者自訂內容
2. 保留現有格式：表格、步驟編號、`⛔ 攔截點` 標記
3. 若有新的程式碼模組或新的 command/rule → 在對應 Skill 補上引用
4. 若現有 Skill 步驟與 `spec-before-code.md` 規則不同步 → 以規則檔為準更新 Skill

### Phase 4: 回報

以條列方式列出：
- 新增／更新了哪個 Skill、哪些步驟
- 哪些引用已被修正
- 是否建議新增全新的 Skill（若偵測到尚未涵蓋的任務類型）
