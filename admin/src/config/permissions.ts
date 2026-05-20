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

  // Selkie 事故
  INCIDENTS_VIEW:     'incidents.view',
  INCIDENTS_CREATE:   'incidents.create',
  INCIDENTS_EDIT:     'incidents.edit',
  INCIDENTS_DELETE:   'incidents.delete',
  INCIDENTS_VIEW_ALL: 'incidents.view_all',
  INCIDENTS_TRIAGE:   'incidents.triage',

  // 角色-權限指派
  ROLE_PERMISSIONS_VIEW: 'role_permissions.view',
  ROLE_PERMISSIONS_EDIT: 'role_permissions.edit',

  // 主動監控
  MONITORS_VIEW:    'monitors.view',
  MONITORS_CREATE:  'monitors.create',
  MONITORS_EDIT:    'monitors.edit',
  MONITORS_DELETE:  'monitors.delete',

  // 通知通道
  NOTIFICATION_CHANNELS_VIEW:    'notification_channels.view',
  NOTIFICATION_CHANNELS_CREATE:  'notification_channels.create',
  NOTIFICATION_CHANNELS_EDIT:    'notification_channels.edit',
  NOTIFICATION_CHANNELS_DELETE:  'notification_channels.delete',

  // 維護視窗
  MAINTENANCE_WINDOWS_VIEW:    'maintenance_windows.view',
  MAINTENANCE_WINDOWS_CREATE:  'maintenance_windows.create',
  MAINTENANCE_WINDOWS_EDIT:    'maintenance_windows.edit',
  MAINTENANCE_WINDOWS_DELETE:  'maintenance_windows.delete',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
