/**
 * 結構化 API 錯誤碼字典
 *
 * 設計：值為 dot-notation string，可直接作為前端 i18n key 查找。
 * 後端：填入 `ApiResult.errorCode`；前端：呼叫 `t(\`errors.\${errorCode}\`)`。
 *
 * 命名慣例：
 *   - groupCode: UPPER_SNAKE_CASE（對應大類）
 *   - leaf:      lower.snake_case（對應 i18n 巢狀 key）
 */
export const ApiErrorCode = {
  AUTH: {
    UNAUTHORIZED:    'auth.unauthorized',
    FORBIDDEN:       'auth.forbidden',
    INVALID_SESSION: 'auth.invalid_session',
    LOGIN_FAILED:    'auth.login_failed',
  },
  VALIDATION: {
    REQUIRED:    'validation.required',
    MAX_LENGTH:  'validation.max_length',
    INVALID:     'validation.invalid',
  },
  KANBAN: {
    CARD_NOT_FOUND:      'kanban.card_not_found',
    FORBIDDEN_NOT_OWNER: 'kanban.forbidden_not_owner',
    INVALID_STATUS:      'kanban.invalid_status',
    TITLE_REQUIRED:      'kanban.title_required',
    TITLE_TOO_LONG:      'kanban.title_too_long',
    DESCRIPTION_TOO_LONG:'kanban.description_too_long',
  },
  ROLE_PERMISSIONS: {
    ROLE_NOT_FOUND:       'role_permissions.role_not_found',
    PERMISSION_NOT_FOUND: 'role_permissions.permission_not_found',
  },
  RATE_LIMIT: {
    EXCEEDED: 'rate_limit.exceeded',
  },
  SYSTEM: {
    INTERNAL_ERROR: 'system.internal_error',
    DB_ERROR:       'system.db_error',
  },
} as const;

/** 所有 errorCode 字串值的 union 型別 */
export type ApiErrorCodeValue =
  | (typeof ApiErrorCode.AUTH)[keyof typeof ApiErrorCode.AUTH]
  | (typeof ApiErrorCode.VALIDATION)[keyof typeof ApiErrorCode.VALIDATION]
  | (typeof ApiErrorCode.KANBAN)[keyof typeof ApiErrorCode.KANBAN]
  | (typeof ApiErrorCode.ROLE_PERMISSIONS)[keyof typeof ApiErrorCode.ROLE_PERMISSIONS]
  | (typeof ApiErrorCode.RATE_LIMIT)[keyof typeof ApiErrorCode.RATE_LIMIT]
  | (typeof ApiErrorCode.SYSTEM)[keyof typeof ApiErrorCode.SYSTEM];
