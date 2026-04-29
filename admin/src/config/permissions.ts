/**
 * 系統權限碼常數
 * 對應 prisma/seed.ts PERMISSIONS 陣列中的 code 欄位
 * 使用方式：withPermission(PERMISSIONS.ROLES_VIEW, handler)
 */
export const PERMISSIONS = {
  // 角色管理
  ROLES_VIEW:   'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_EDIT:   'roles.edit',
  ROLES_DELETE: 'roles.delete',

  // 使用者角色
  USER_ROLES_VIEW: 'user_roles.view',
  USER_ROLES_EDIT: 'user_roles.edit',

  // 稽核
  AUDIT_LOGS_VIEW:    'audit_logs.view',
  LOGIN_RECORDS_VIEW: 'login_records.view',

  // Kanban 看板
  KANBAN_VIEW:       'kanban.view',
  KANBAN_CREATE:     'kanban.create',
  KANBAN_EDIT:       'kanban.edit',
  KANBAN_DELETE:     'kanban.delete',
  KANBAN_VIEW_ALL:   'kanban.view_all',
  KANBAN_EDIT_ALL:   'kanban.edit_all',
  KANBAN_DELETE_ALL: 'kanban.delete_all',

  // 角色-權限指派
  ROLE_PERMISSIONS_VIEW: 'role_permissions.view',
  ROLE_PERMISSIONS_EDIT: 'role_permissions.edit',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
