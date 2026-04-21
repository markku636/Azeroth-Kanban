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

  // 權限
  PERMISSIONS_VIEW: 'permissions.view',

  // 使用者角色
  USER_ROLES_VIEW: 'user_roles.view',
  USER_ROLES_EDIT: 'user_roles.edit',

  // 稽核
  AUDIT_LOGS_VIEW:    'audit_logs.view',
  LOGIN_RECORDS_VIEW: 'login_records.view',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
