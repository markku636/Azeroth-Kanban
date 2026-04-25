import { routes } from "@/config/routes";
import { PERMISSIONS } from "@/config/permissions";
import {
  PiUserCircleDuotone,
  PiShieldCheckDuotone,
  PiShieldWarningDuotone,
  PiUserGearDuotone,
  PiClipboardTextDuotone,
  PiKanbanDuotone,
} from "react-icons/pi";

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
    name: "admin.menu.myAccount",
    href: routes.me,
    icon: <PiUserCircleDuotone />,
  },

  // ── Kanban ──
  {
    name: "admin.menu.kanban",
    href: routes.kanban,
    icon: <PiKanbanDuotone />,
    requiredPermission: PERMISSIONS.KANBAN_VIEW,
  },

  // ── RBAC ──
  { name: "admin.menu.systemSettings" },
  {
    name: "admin.menu.roles",
    href: routes.roles.list,
    icon: <PiShieldCheckDuotone />,
    requiredPermission: PERMISSIONS.ROLES_VIEW,
  },
  {
    name: "admin.menu.userRoles",
    href: routes.userRoles.list,
    icon: <PiUserGearDuotone />,
    requiredPermission: PERMISSIONS.USER_ROLES_VIEW,
  },

  // ── 稽核 ──
  { name: "admin.menu.audit" },
  {
    name: "admin.menu.auditLogs",
    href: routes.auditLogs,
    icon: <PiClipboardTextDuotone />,
    requiredPermission: PERMISSIONS.AUDIT_LOGS_VIEW,
  },
  {
    name: "admin.menu.loginRecords",
    href: routes.loginRecords,
    icon: <PiShieldWarningDuotone />,
    requiredPermission: PERMISSIONS.LOGIN_RECORDS_VIEW,
  },
];
