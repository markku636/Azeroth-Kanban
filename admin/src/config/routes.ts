// ─── 公司端（Admin Portal）路由 ───
export const adminRoutes = {
  login: '/login',
  dashboard: '/kanban',
  me: '/me',
  kanban: '/kanban',
  roles: { list: '/roles' },
  userRoles: { list: '/user-roles' },
  auditLogs: '/audit-logs',
  loginRecords: '/login-records',
};

// 向下相容
export const routes = adminRoutes;
