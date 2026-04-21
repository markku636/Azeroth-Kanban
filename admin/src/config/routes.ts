// ─── 公司端（Admin Portal）路由 ───
export const adminRoutes = {
  login: '/admin/login',
  dashboard: '/admin',
  me: '/admin/me',
  roles: { list: '/admin/roles' },
  userRoles: { list: '/admin/user-roles' },
  auditLogs: '/admin/audit-logs',
  loginRecords: '/admin/login-records',
};

// 向下相容
export const routes = adminRoutes;
