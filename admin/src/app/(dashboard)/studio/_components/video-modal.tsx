'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { PiXBold, PiDownloadSimpleBold, PiWarningCircleBold, PiExportBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';

/**
 * 共用影片預覽播放器。用於：成片預覽（專案 output）、單鏡 clip 預覽。
 * src 走後端 Range-enabled 串流路由，可拖曳進度條；附下載鈕。
 * 傳 exportProjectId 時，附「匯出 GIF / WebM」鈕（排入 worker 轉檔 → 輪詢 → 下載）。
 */
export function VideoModal({
  title,
  src,
  downloadName,
  exportProjectId,
  onClose,
}: {
  title: string;
  src: string;
  downloadName?: string;
  exportProjectId?: string;
  onClose: () => void;
}) {
  const [err, setErr] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ w: number; h: number; dur: number } | null>(null);
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const doExport = async (fmt: 'gif' | 'webm') => {
    if (!exportProjectId || exporting) return;
    setExporting(fmt);
    const t = toast.loading(`匯出 ${fmt.toUpperCase()} 中…（排入 GPU 佇列轉檔）`);
    try {
      const res = await fetch(`/api/v1/studio/projects/${exportProjectId}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: fmt }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '匯出失敗'); }
      const base = `/api/v1/studio/projects/${exportProjectId}/export?format=${fmt}`;
      for (let i = 0; i < 48; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const c = await fetch(`${base}&check=1`).then((r) => r.json()).catch(() => ({ ready: false }));
        if (c.ready) { window.open(`${base}&t=${Date.now()}`, '_blank'); toast.success(`${fmt.toUpperCase()} 已就緒，開始下載`, { id: t }); setExporting(null); return; }
      }
      throw new Error('匯出逾時（可能正在排隊），稍後可再試');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '匯出失敗', { id: t });
      setExporting(null);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-semibold text-gray-900">{title}</span>
            {meta && <span className="flex-none text-xs font-normal text-gray-400">{meta.w}×{meta.h} · {fmtDur(meta.dur)}</span>}
          </div>
          <div className="flex flex-none items-center gap-3">
            {!err && exportProjectId && (
              <>
                <button type="button" onClick={() => void doExport('gif')} disabled={!!exporting} className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary disabled:opacity-40" title="匯出 GIF（適合迷因預覽）">
                  <PiExportBold className="h-4 w-4" /> {exporting === 'gif' ? '匯出中…' : 'GIF'}
                </button>
                <button type="button" onClick={() => void doExport('webm')} disabled={!!exporting} className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary disabled:opacity-40" title="匯出 WebM（檔案較小）">
                  <PiExportBold className="h-4 w-4" /> {exporting === 'webm' ? '匯出中…' : 'WebM'}
                </button>
              </>
            )}
            {!err && (
              <a
                href={src}
                download={(downloadName ?? '').replace(/[\\/:*?"<>|]/g, '_')}
                className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary"
                title="下載影片"
              >
                <PiDownloadSimpleBold className="h-4 w-4" /> 下載
              </a>
            )}
            <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 transition-colors hover:text-gray-600">
              <PiXBold className="h-4 w-4" />
            </button>
          </div>
        </div>
        {err ? (
          <div className="flex flex-col items-center justify-center gap-2 bg-gray-50 px-6 py-16 text-center text-sm text-gray-500">
            <PiWarningCircleBold className="h-8 w-8 text-gray-300" />
            影片暫時無法播放，可能尚未生成或檔案已被覆蓋。
          </div>
        ) : (
          <div className="flex items-center justify-center bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={src} controls autoPlay playsInline onError={() => setErr(true)} className="max-h-[78vh] w-auto max-w-full" />
          </div>
        )}
      </div>
    </Modal>
  );
}
