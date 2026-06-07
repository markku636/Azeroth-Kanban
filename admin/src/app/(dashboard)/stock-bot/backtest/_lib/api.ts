/** 回測 / 比較頁共用的輕量 fetch helper。 */

export interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

/** GET 並取 data（失敗回 null）。 */
export async function apiGet<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<T>;
  return json.success ? (json.data ?? null) : null;
}

/** POST JSON 並回完整 ApiResult。 */
export async function apiPost<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResult<T>;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
