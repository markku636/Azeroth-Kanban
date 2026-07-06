'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Textarea } from 'rizzui';
import { PiXBold, PiYoutubeLogoFill, PiSparkleFill, PiInfoBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { DURATION_PRESETS, shotsForDuration, estimatedSeconds } from '@/lib/studio/pacing';

/**
 * 「YouTube 改編」：貼上 YouTube 網址或字幕逐字稿 → AI 依其敘事結構與節奏，改編成本專案的**原創**分鏡
 * （不逐字照抄、融入本專案角色/風格）。直接建立分鏡到看板，使用者可再編輯。
 * 注意：URL 抓字幕為 best-effort（YouTube 常擋伺服器端抓取）；最可靠是貼上逐字稿。
 */
export function YoutubeImportModal({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('');
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return; // 防重複送出（鍵盤 Enter 連按會建立重複分鏡）
    if (!source.trim() && !url.trim()) { toast.error('請貼上字幕逐字稿，或填入 YouTube 網址'); return; }
    setBusy(true);
    if (count > 12) toast('長片會分批改編，約需 30～60 秒，請稍候…', { icon: '🎬' });
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/from-youtube`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() || undefined, source: source.trim() || undefined, count: Math.min(40, Math.max(1, count)), persist: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.code !== 0) throw new Error(j.message ?? '改編失敗');
      toast.success('已依來源改編並建立分鏡 🎬');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '改編失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-900">
            <PiYoutubeLogoFill className="h-5 w-5 flex-none text-red-500" />
            <span className="truncate">YouTube 改編 · 依來源節奏產生原創分鏡</span>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="flex-none text-gray-400 transition-colors hover:text-gray-600">
            <PiXBold className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
            <PiInfoBold className="mt-0.5 h-4 w-4 flex-none" />
            <span>AI 會萃取來源影片的<b>敘事結構與節奏</b>，改編成<b>內容原創</b>的分鏡（不逐字照抄、融入本專案角色/風格）。<b>貼上字幕逐字稿最可靠</b>；只填網址時系統會盡量抓字幕，抓不到會提示你改用貼上。</span>
          </div>

          <label className="mb-1 block text-sm font-medium text-gray-700">① 貼上字幕逐字稿（推薦）</label>
          <p className="mb-1.5 text-xs text-gray-400">在 YouTube 影片下方「⋯ → 顯示轉錄稿」複製，或直接貼腳本。中英文皆可。</p>
          <Textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="YouTube 字幕逐字稿"
            placeholder={'0:00 大家好 今天要來挑戰…\n0:04 我從小就夢想…\n（貼上整段字幕或腳本）'}
            rows={7}
            className="mb-4"
            textareaClassName="bg-white text-gray-900 dark:bg-gray-50"
          />

          <label className="mb-1 block text-sm font-medium text-gray-700">② 或填 YouTube 網址（best-effort 抓字幕）</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="YouTube 網址"
            placeholder="https://www.youtube.com/watch?v=... 或 youtu.be/... 或 /shorts/..."
            className="mb-4"
            inputClassName="bg-white text-gray-900 dark:bg-gray-50"
          />

          <label className="mb-1 block text-sm font-medium text-gray-700">③ 目標片長</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((p) => {
              const active = count === shotsForDuration(p.seconds);
              return (
                <button
                  key={p.seconds}
                  type="button"
                  onClick={() => setCount(shotsForDuration(p.seconds))}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    active
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-red-300 hover:text-red-700'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">進階：分鏡數</span>
            <input
              type="number" min={1} max={40} value={count}
              onChange={(e) => setCount(Math.min(40, Math.max(1, Number(e.target.value) || 8)))}
              aria-label="分鏡數量"
              className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:bg-gray-50"
            />
            <span className="text-xs text-gray-400">≈ {estimatedSeconds(count)} 秒 · {count} 鏡{count > 12 ? '（分批改編，會多花點時間）' : ''}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-300">
          <Button variant="outline" onClick={onClose} disabled={busy} className="border-gray-300 text-gray-600">取消</Button>
          <Button onClick={() => void run()} isLoading={busy} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
            <PiSparkleFill className="me-1.5 h-4 w-4" /> 改編並建立分鏡
          </Button>
        </div>
      </div>
    </Modal>
  );
}
