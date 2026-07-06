// stock.ts — Pexels 免費圖庫「自動 B-roll」來源。純粹的請求組裝 + 回應解析（可單元測試）；實際 fetch/下載是薄
// 包裝，用 global fetch。需環境變數 PEXELS_API_KEY 才會實際打 API；無金鑰時整條路徑安全回 null（零回歸）。
// Pexels API 文件：https://www.pexels.com/api/documentation/（免費，200 req/hr）。
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const PEXELS_API = 'https://api.pexels.com/v1';

export interface PexelsPhotoSrc {
  original?: string; large2x?: string; large?: string; medium?: string;
  portrait?: string; landscape?: string; tiny?: string;
}
export interface PexelsPhoto { id: number; width: number; height: number; src: PexelsPhotoSrc }

export type StockOrientation = 'portrait' | 'landscape' | 'square';

/** 專案畫幅 → Pexels orientation。9:16→portrait、16:9→landscape、1:1→square（未知退 portrait）。 */
export function orientationForAspect(aspect: string): StockOrientation {
  if (aspect === '16:9') return 'landscape';
  if (aspect === '1:1') return 'square';
  return 'portrait';
}

/** 建 Pexels 搜尋 URL（query + orientation + size=large + per_page 1–80）。純函式、可測。 */
export function pexelsSearchUrl(query: string, opts: { orientation?: StockOrientation; perPage?: number } = {}): string {
  const p = new URLSearchParams();
  p.set('query', query.trim());
  if (opts.orientation) p.set('orientation', opts.orientation);
  p.set('size', 'large'); // 至少 Full HD，放到 720/1080p 才夠清
  p.set('per_page', String(Math.min(80, Math.max(1, Math.floor(opts.perPage ?? 12)))));
  return `${PEXELS_API}/search?${p.toString()}`;
}

/**
 * 從 Pexels 回應挑最合適的圖片 URL：優先用 Pexels 已依 orientation 裁好的 portrait/landscape 版（對齊短影音直式），
 * 否則退 large2x → original。純函式、可測。無結果回 null。idx 供「同一 query 換一張」（避免整片同圖）。
 */
export function pickPhotoSrc(resp: { photos?: PexelsPhoto[] } | null | undefined, opts: { orientation?: StockOrientation; idx?: number } = {}): string | null {
  const photos = resp?.photos ?? [];
  if (!photos.length) return null;
  const photo = photos[Math.abs(Math.trunc(opts.idx ?? 0)) % photos.length];
  const s = photo?.src ?? {};
  if (opts.orientation === 'portrait' && s.portrait) return s.portrait;
  if (opts.orientation === 'landscape' && s.landscape) return s.landscape;
  return s.large2x ?? s.large ?? s.original ?? null;
}

// SDXL prompt 常見修飾詞（燈光/畫質/鏡頭/風格等）＋停用詞 → 從 stock 搜尋 query 去掉，只留主體名詞，命中率較高。
const STOCK_STOPWORDS = new Set([
  'highly', 'detailed', 'realistic', 'photo', 'photograph', 'photorealistic', 'cinematic', 'lighting', 'light',
  '8k', '4k', 'hd', 'uhd', 'shot', 'wide', 'angle', 'close', 'closeup', 'up', 'depth', 'field', 'bokeh',
  'professional', 'studio', 'background', 'high', 'quality', 'ultra', 'sharp', 'focus', 'style', 'color', 'colour',
  'vibrant', 'dramatic', 'soft', 'natural', 'render', 'digital', 'art', 'masterpiece', 'best', 'beautiful', 'stunning',
  'the', 'a', 'an', 'with', 'and', 'in', 'on', 'of', 'to', 'at', 'by', 'for', 'view', 'scene', 'image', 'picture',
]);

/** 由 shot.visual（SDXL 英文 prompt）擷取適合 stock 搜尋的短關鍵字（去修飾/停用詞、去重、取前 max 個）。純函式、可測。 */
export function stockQueryFromShot(shot: { visual?: string | null; tts?: string | null }, max = 4): string {
  const src = (shot.visual ?? '').toLowerCase();
  const words = src.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOCK_STOPWORDS.has(w));
  const uniq: string[] = [];
  for (const w of words) { if (!uniq.includes(w)) uniq.push(w); if (uniq.length >= max) break; }
  return uniq.join(' ').trim();
}

/** 是否已設定 Pexels 金鑰（決定是否啟用 stock B-roll）。 */
export function stockApiKey(): string { return (process.env.PEXELS_API_KEY ?? '').trim(); }

/** 實際搜尋（需 apiKey）；回最合適圖 URL 或 null。網路/金鑰缺失/非 200 都安全回 null。 */
export async function fetchStockPhotoUrl(query: string, opts: { apiKey: string; orientation?: StockOrientation; idx?: number }): Promise<string | null> {
  if (!opts.apiKey || !query.trim()) return null;
  try {
    const res = await fetch(pexelsSearchUrl(query, { orientation: opts.orientation }), { headers: { Authorization: opts.apiKey } });
    if (!res.ok) return null;
    const json = (await res.json()) as { photos?: PexelsPhoto[] };
    return pickPhotoSrc(json, { orientation: opts.orientation, idx: opts.idx });
  } catch { return null; }
}

/** 下載圖片到 dest（best-effort）；成功回 true。失敗（網路/非 200）回 false，呼叫端可 fallback。 */
export async function downloadImage(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) return false;
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest));
    return true;
  } catch { return false; }
}
