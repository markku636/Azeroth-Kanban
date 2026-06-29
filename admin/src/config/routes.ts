// ─── 公司端（Admin Portal）路由 ───
export const adminRoutes = {
  login: '/login',
  dashboard: '/studio',
  me: '/me',
  roles: { list: '/roles' },
  userRoles: { list: '/user-roles' },
  auditLogs: '/audit-logs',
  loginRecords: '/login-records',
  studio: {
    list: '/studio',
    queue: '/studio/queue',
    characters: '/studio/characters',
    characterDetail: (id: string) => `/studio/characters/${id}`,
    detail: (id: string) => `/studio/${id}`,
    story: (id: string) => `/studio/${id}/story`,
    script: (id: string) => `/studio/${id}/script`,
  },
  media: { list: '/media' },
};

// 向下相容
export const routes = adminRoutes;
