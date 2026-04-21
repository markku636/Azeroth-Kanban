# docs/ — 共用文件

本目錄統一管理跨子專案的計劃、規格、錯誤紀錄、開發日誌與知識庫。由 Write-doc-before-Code 工作流自動維護。

## 目錄結構

| 資料夾 | 用途 | 生命週期 |
| --- | --- | --- |
| `plans/{doing,completed}/` | 功能開發計劃書（大型需求） | `doing/` → `completed/`（SessionEnd 自動歸檔） |
| `specs/{doing,completed}/` | 技術規格（Spec-before-Code） | 同上 |
| `bugs/{doing,completed}/` | Bug 知識庫（有通用價值的錯誤紀錄） | 同上 |
| `logs/` | 開發日誌（append-only） | 不歸檔 |
| `knowledge/{architecture,patterns,domain,integrations}/` | 流程知識庫（AI 自動提煉） | 永久保留 |
| `knowledge/INDEX.md` | Knowledge 索引表 | SessionEnd Hook 維護 |
| `decisions/` | ADR（架構決策記錄） | 永久保留 |

## 檔案命名

所有 AI 自動產生的文件統一使用：

```
{YYYYMMDD}-{NNN}-{kebab-case-name}.ext
```

- `YYYYMMDD`：建立日期
- `NNN`：同目錄當日流水號（001, 002, ...）
- `.ext`：`.spec.md`（Spec）／`.md`（其他）

## 模板

- `specs/_spec-template.md`
- `bugs/_bug-template.md`
- `plans/_plan-template.md`
- `logs/_log-template.md`
- `knowledge/_knowledge-template.md`

## 相關配置

- 規則檔：[`.claude/rules/spec-before-code.md`](../.claude/rules/spec-before-code.md)
- Slash 指令：[`.claude/commands/create-spec.md`](../.claude/commands/create-spec.md)
- Hook 腳本：[`.claude/hooks/`](../.claude/hooks/)

## 暫存檔（git 忽略）

- `.archive-manifest.json`：SessionEnd 歸檔清單，供 `session-end-knowledge.mjs` 讀取
