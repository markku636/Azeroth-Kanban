# Knowledge 索引

> 本檔案由 `.claude/hooks/session-end-knowledge.mjs` 於 Session 結束時自動維護。
> 新增/更新 Knowledge 文件後，會在此表格追加對應列。

| 日期 | 分類 | 檔案 | 摘要 |
| --- | --- | --- | --- |
| 2026-04-25 | patterns | [`patterns/20260425-001-auto-inverting-gray-palette.md`](./patterns/20260425-001-auto-inverting-gray-palette.md) | hydrogen / RizzUI gray scale 在 dark mode 整組反轉，直接用 `bg-gray-0` / `text-gray-900` 即可，禁用 `dark:bg-gray-{700,800,900}` |
| 2026-04-25 | patterns | [`patterns/20260425-002-sortorder-integer-median-with-normalize.md`](./patterns/20260425-002-sortorder-integer-median-with-normalize.md) | 拖拉排序 sortOrder：整數 + 中位數插入 + 衝突時批次 normalize；client 只送 `beforeId/afterId`，server 算 |
| 2026-04-25 | integrations | [`integrations/20260425-001-nextauth-v5-keycloak-dual-provider.md`](./integrations/20260425-001-nextauth-v5-keycloak-dual-provider.md) | NextAuth v5 + Keycloak SSO 主流程 + Credentials env-gated fallback；含 `host.docker.internal` issuer 配置與 entrypoint.sh migrate/seed |
