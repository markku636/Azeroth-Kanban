import { routes } from '@/config/routes';
import { PERMISSIONS } from '@/config/permissions';
import {
  PiUserCircleDuotone,
  PiShieldCheckDuotone,
  PiShieldWarningDuotone,
  PiUserGearDuotone,
  PiClipboardTextDuotone,
  PiChartLineUpDuotone,
  PiPulseDuotone,
  PiFunnelDuotone,
  PiInfoDuotone,
  PiChartBarDuotone,
  PiBookOpenTextDuotone,
  PiStarDuotone,
  PiClockCounterClockwiseDuotone,
  PiArrowsLeftRightDuotone,
} from 'react-icons/pi';

export interface MenuItem {
  name: string;
  href?: string;
  icon?: React.ReactNode;
  requiredPermission?: string;
  dropdownItems?: MenuItem[];
  showNewBadge?: boolean;
}

export const menuItems: MenuItem[] = [
  {
    name: 'admin.menu.myAccount',
    href: routes.me,
    icon: <PiUserCircleDuotone />,
  },

  // ── 股票 AI 機器人 ──
  { name: 'admin.menu.stockBot' },
  {
    name: 'admin.menu.stockConsole',
    href: routes.stockBot.console,
    icon: <PiChartLineUpDuotone />,
    requiredPermission: PERMISSIONS.STOCK_SIGNAL_VIEW,
    showNewBadge: true,
  },
  {
    name: 'admin.menu.stockWatchlist',
    href: routes.stockBot.watchlist,
    icon: <PiStarDuotone />,
    requiredPermission: PERMISSIONS.STOCK_SIGNAL_VIEW,
  },
  {
    name: 'admin.menu.stockScreener',
    href: routes.stockBot.screener,
    icon: <PiFunnelDuotone />,
    requiredPermission: PERMISSIONS.STOCK_SIGNAL_VIEW,
  },
  {
    name: 'admin.menu.stockMarket',
    href: routes.stockBot.market,
    icon: <PiChartBarDuotone />,
    requiredPermission: PERMISSIONS.STOCK_SIGNAL_VIEW,
  },
  {
    name: 'admin.menu.stockBacktest',
    href: routes.stockBot.backtest,
    icon: <PiClockCounterClockwiseDuotone />,
    requiredPermission: PERMISSIONS.STOCK_SIGNAL_VIEW,
    dropdownItems: [
      {
        name: 'admin.menu.backtestSingle',
        href: routes.stockBot.backtest,
      },
      {
        name: 'admin.menu.backtestCompare',
        href: routes.stockBot.backtestCompare,
        icon: <PiArrowsLeftRightDuotone />,
      },
    ],
  },
  {
    name: 'admin.menu.stockMonitor',
    href: routes.stockBot.monitor,
    icon: <PiPulseDuotone />,
    requiredPermission: PERMISSIONS.STOCK_BOT_ADMIN,
  },
  {
    name: 'admin.menu.stockGlossary',
    href: routes.stockBot.glossary,
    icon: <PiBookOpenTextDuotone />,
    requiredPermission: PERMISSIONS.STOCK_SIGNAL_VIEW,
  },
  {
    name: 'admin.menu.stockAbout',
    href: routes.stockBot.about,
    icon: <PiInfoDuotone />,
    requiredPermission: PERMISSIONS.STOCK_SIGNAL_VIEW,
  },

  // ── RBAC ──
  { name: 'admin.menu.systemSettings' },
  {
    name: 'admin.menu.roles',
    href: routes.roles.list,
    icon: <PiShieldCheckDuotone />,
    requiredPermission: PERMISSIONS.ROLES_VIEW,
  },
  {
    name: 'admin.menu.userRoles',
    href: routes.userRoles.list,
    icon: <PiUserGearDuotone />,
    requiredPermission: PERMISSIONS.USER_ROLES_VIEW,
  },

  // ── 稽核 ──
  { name: 'admin.menu.audit' },
  {
    name: 'admin.menu.auditLogs',
    href: routes.auditLogs,
    icon: <PiClipboardTextDuotone />,
    requiredPermission: PERMISSIONS.AUDIT_LOGS_VIEW,
  },
  {
    name: 'admin.menu.loginRecords',
    href: routes.loginRecords,
    icon: <PiShieldWarningDuotone />,
    requiredPermission: PERMISSIONS.LOGIN_RECORDS_VIEW,
  },
];
