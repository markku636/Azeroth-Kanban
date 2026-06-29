import { describe, it, expect } from 'vitest';
import { ApiResponse, ApiReturnCode } from './api-response';

// 每個 studio 路由都用 ApiResponse.ok/fail 回應；這裡鎖住「code → HTTP status」對應與回應外型。
describe('ApiResponse', () => {
  it('ok() → HTTP 200 + code=SUCCESS + data/message', async () => {
    const res = ApiResponse.ok({ x: 1 }, '好');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(ApiReturnCode.SUCCESS);
    expect(body.data).toEqual({ x: 1 });
    expect(body.message).toBe('好');
  });

  it('fail() → HTTP status 等於錯誤碼 + 帶 message', async () => {
    const res = ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到');
    expect(res.status).toBe(ApiReturnCode.NOT_FOUND);
    const body = await res.json();
    expect(body.code).toBe(ApiReturnCode.NOT_FOUND);
    expect(body.message).toBe('找不到');
  });

  it('json(success) → 200', () => {
    const res = ApiResponse.json(ApiResponse.success({ a: 1 }));
    expect(res.status).toBe(200);
  });

  it('json(error) → status = 錯誤碼', () => {
    const res = ApiResponse.json(ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '參數錯'));
    expect(res.status).toBe(ApiReturnCode.VALIDATION_ERROR);
  });
});
