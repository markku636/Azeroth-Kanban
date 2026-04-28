/**
 * 將 API 回應的 errorCode 透過 useTranslation 轉成使用者語言訊息
 *
 * 流程：
 *  1. 若 result.success → 回空字串（呼叫端應自行判斷）
 *  2. 若 result.errorCode 存在且 i18n 有對應翻譯 → 回翻譯結果（含 errorParams 插值）
 *  3. 否則回 result.message（後端原始訊息）
 *  4. 若 result.message 也空 → 回 fallbackKey 的翻譯（預設「系統錯誤」）
 *
 * 用法：
 *   const res = await fetch(...).then(r => r.json());
 *   if (!res.success) toast.error(tApiError(res, t));
 */
export interface ApiEnvelope<T = unknown> {
  success: boolean;
  message?: string;
  errorCode?: string;
  errorParams?: Record<string, unknown>;
  data?: T;
}

type T = (key: string, params?: Record<string, string | number>) => string;

export function tApiError<TData = unknown>(
  result: ApiEnvelope<TData>,
  t: T,
  fallbackKey: string = 'errors.system.internal_error'
): string {
  if (result.success) {return '';}

  if (result.errorCode) {
    const key = `errors.${result.errorCode}`;
    const params = sanitizeParams(result.errorParams);
    const translated = t(key, params);
    // useTranslation 找不到時回傳 key 本身；以此判斷是否真有翻譯
    if (translated !== key) {return translated;}
  }

  if (result.message) {return result.message;}
  return t(fallbackKey);
}

function sanitizeParams(
  raw: Record<string, unknown> | undefined
): Record<string, string | number> | undefined {
  if (!raw) {return undefined;}
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' || typeof v === 'number') {out[k] = v;}
    else if (v !== null && v !== undefined) {out[k] = String(v);}
  }
  return Object.keys(out).length ? out : undefined;
}
