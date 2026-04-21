import { NextResponse } from 'next/server';
import {
  ApiResponse as BaseApiResponse,
  ApiReturnCode,
  ApiResult,
} from '@iqt/common';

export { ApiReturnCode };
export type { ApiResult };

/**
 * API 回應工具類別（Next.js 擴充版）
 * 繼承 @iqt/common 的 ApiResponse，補充 NextResponse 相關方法
 *
 * @example
 * // 成功回傳
 * return ApiResponse.success(data, '取得資料成功');
 *
 * // 錯誤回傳
 * return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到資料');
 *
 * // 使用 NextResponse
 * return ApiResponse.json(ApiResponse.success(data));
 */
export class ApiResponse extends BaseApiResponse {
  /**
   * 轉換為 NextResponse JSON 回應
   * 自動根據 code 設定 HTTP status
   */
  static json<T>(result: ApiResult<T>): NextResponse<ApiResult<T>> {
    const httpStatus = result.code === ApiReturnCode.SUCCESS ? 200 : result.code;
    return NextResponse.json(result, { status: httpStatus });
  }

  /**
   * 快捷方法：成功回傳並轉為 NextResponse
   */
  static ok<T>(data?: T, message: string = '成功'): NextResponse<ApiResult<T>> {
    return this.json(this.success(data, message));
  }

  /**
   * 快捷方法：錯誤回傳並轉為 NextResponse
   */
  static fail(
    code: ApiReturnCode,
    message: string,
    errorCode?: string,
    errorParams?: Record<string, unknown>
  ): NextResponse<ApiResult> {
    return this.json(this.error(code, message, errorCode, errorParams));
  }
}
