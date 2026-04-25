/**
 * 統一 API 回傳代碼
 */
export enum ApiReturnCode {
  SUCCESS = 0,
  VALIDATION_ERROR = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  RATE_LIMIT_EXCEEDED = 429,
  INTERNAL_ERROR = 500,
}

/**
 * 統一 API 回傳格式介面
 */
export interface ApiResult<T = unknown> {
  success: boolean;
  code: ApiReturnCode;
  message: string;
  /** 結構化錯誤碼（對應 locales.errors.{code}）；為選填以維持向後相容 */
  errorCode?: string;
  /** 錯誤碼插值參數（對應 i18n `{{var}}`） */
  errorParams?: Record<string, unknown>;
  data?: T;
  timestamp: number;
}

/**
 * API 回應工具類別（框架無關）
 * 提供標準化的 API 回傳格式，可在 Next.js 與 NestJS 共用
 */
export class ApiResponse {
  static success<T>(data?: T, message: string = '成功'): ApiResult<T> {
    return {
      success: true,
      code: ApiReturnCode.SUCCESS,
      message,
      data,
      timestamp: Date.now(),
    };
  }

  static error<T = never>(
    code: ApiReturnCode,
    message: string,
    errorCode?: string,
    errorParams?: Record<string, unknown>
  ): ApiResult<T> {
    return {
      success: false,
      code,
      message,
      ...(errorCode && { errorCode }),
      ...(errorParams && { errorParams }),
      timestamp: Date.now(),
    };
  }

  static validationError<T = never>(message: string = '輸入驗證失敗'): ApiResult<T> {
    return this.error<T>(ApiReturnCode.VALIDATION_ERROR, message);
  }

  static unauthorized<T = never>(message: string = '未授權存取'): ApiResult<T> {
    return this.error<T>(ApiReturnCode.UNAUTHORIZED, message);
  }

  static forbidden<T = never>(message: string = '禁止存取'): ApiResult<T> {
    return this.error<T>(ApiReturnCode.FORBIDDEN, message);
  }

  static notFound<T = never>(message: string = '找不到資源'): ApiResult<T> {
    return this.error<T>(ApiReturnCode.NOT_FOUND, message);
  }

  static internalError<T = never>(message: string = '伺服器內部錯誤'): ApiResult<T> {
    return this.error<T>(ApiReturnCode.INTERNAL_ERROR, message);
  }

  static rateLimitExceeded<T = never>(message: string = '請求頻率超過限制'): ApiResult<T> {
    return this.error<T>(ApiReturnCode.RATE_LIMIT_EXCEEDED, message);
  }
}
