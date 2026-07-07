// 匯出下載的 Content-Disposition 檔名（帶專案標題）。純函式、可測。
// 中文檔名要走 RFC 5987 的 filename*=UTF-8''...；同時附 ASCII fallback filename= 給老客戶端。

/** 清掉檔名不允許/危險字元（Windows 保留字元、控制字元、路徑分隔），壓縮空白，截長。 */
export function sanitizeFilename(name: string, max = 60): string {
  let out = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** 組出含 UTF-8 檔名的 Content-Disposition 值：title 空→只用 fallbackBase。 */
export function contentDisposition(title: string | null | undefined, fallbackBase: string, ext: string): string {
  const clean = sanitizeFilename(title ?? '');
  const base = clean || fallbackBase;
  const utf8 = encodeURIComponent(`${base}.${ext}`);
  // ASCII fallback（部分老客戶端只認 filename=）：去非 ASCII，空了就用 fallbackBase
  let ascii = '';
  for (const ch of clean) { const c = ch.codePointAt(0) ?? 0; if (c >= 0x20 && c <= 0x7e && ch !== '"') ascii += ch; }
  ascii = ascii.trim() || fallbackBase;
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${utf8}`;
}
