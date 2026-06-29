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

  // 角色-權限指派
  ROLE_PERMISSIONS_VIEW: 'role_permissions.view',
  ROLE_PERMISSIONS_EDIT: 'role_permissions.edit',

  // Studio 影片工作室
  STUDIO_VIEW:       'studio.view',
  STUDIO_CREATE:     'studio.create',
  STUDIO_EDIT:       'studio.edit',
  STUDIO_DELETE:     'studio.delete',
  STUDIO_VIEW_ALL:   'studio.view_all',
  STUDIO_EDIT_ALL:   'studio.edit_all',
  STUDIO_DELETE_ALL: 'studio.delete_all',

  // 媒體庫
  MEDIA_VIEW:       'media.view',
  MEDIA_CREATE:     'media.create',
  MEDIA_DELETE:     'media.delete',
  MEDIA_VIEW_ALL:   'media.view_all',
  MEDIA_DELETE_ALL: 'media.delete_all',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
