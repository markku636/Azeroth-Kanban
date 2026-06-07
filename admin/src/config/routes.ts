// ─── 公司端（Admin Portal）路由 ───
export const adminRoutes = {
  login: '/login',
  dashboard: '/stock-bot/console',
  me: '/me',
  roles: { list: '/roles' },
  userRoles: { list: '/user-roles' },
  auditLogs: '/audit-logs',
  loginRecords: '/login-records',
  stockBot: {
    console: '/stock-bot/console',
    watchlist: '/stock-bot/watchlist',
    screener: '/stock-bot/screener',
    market: '/stock-bot/market',
    backtest: '/stock-bot/backtest',
    backtestCompare: '/stock-bot/backtest/compare',
    monitor: '/stock-bot/monitor',
    about: '/stock-bot/about',
    glossary: '/stock-bot/glossary',
  },
};

// 向下相容
export const routes = adminRoutes;
