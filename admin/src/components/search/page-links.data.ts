import { routes } from "@/config/routes";

// Note: label-only items (no href) are rendered as category labels
export const pageLinks = [
  { name: "admin.menu.myAccount", href: routes.me },

  { name: "admin.menu.systemSettings" },
  { name: "admin.menu.roles", href: routes.roles.list },
  { name: "admin.menu.userRoles", href: routes.userRoles.list },

  { name: "admin.menu.audit" },
  { name: "admin.menu.auditLogs", href: routes.auditLogs },
  { name: "admin.menu.loginRecords", href: routes.loginRecords },
];
