'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button, Input, Textarea } from 'rizzui';
import { PiXBold, PiYoutubeLogoFill, PiSparkleFill, PiInfoBold, PiWarningBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { DURATION_PRESETS, shotsForDuration, estimatedSeconds } from '@/lib/studio/pacing';

/**
 * 「從 YouTube 快速建立」：貼一支影片（或逐字稿）＋取個片名 → 一步建立專案並依來源節奏改編出**原創**分鏡，
 * 直接進看板。這是抄片使用者的最短路徑（省掉先建專案再開匯入的步驟）；要逐鏡審核可改用看板裡的「YouTube 改編」。
 */
export function YoutubeQuickStartModal({ aspect, onClose }: { aspect: string; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('');
  const [count, setCount] = useState(shotsForDuration(120)); // 預設鎖 2 分鐘
  const [busy, setBusy] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/studio/config').then((r) => r.json())
      .then((j) => { if (alive) setAiReady(j?.code === 0 ? Boolean(j.data?.aiEnabled) : true); })
      .catch(() => { if (alive) setAiReady(true); });
    return () => { alive = false; };
  }, []);

  const run = async () => {
    if (busy) return;
    if (!title.trim()) { toast.error('先幫這支片取個名'); return; }
    if (!source.trim() && !url.trim()) { toast.error('貼上字幕逐字稿，或填 YouTube 網址'); return; }
    setBusy(true);
    try {
      // 1) 建立專案
      const pr = await fetch('/api/v1/studio/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), aspect }),
      });
      const pj = await pr.json().catch(() => ({}));
      const id = pj?.data?.id as string | undefined;
      if (!pr.ok || !id) throw new Error(pj?.message ?? '建立專案失敗');

      // 2) 一步改編落庫（長片會分批，先給預期）
      if (count > 12) toast('長片會分批改編，約需 30～60 秒，請稍候…', { icon: '🎬' });
      const ir = await fetch(`/api/v1/studio/projects/${id}/from-youtube`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() || undefined, source: source.trim() || undefined, count: Math.min(40, Math.max(1, count)), persist: true }),
      });
      const ij = await ir.json().catch(() => ({}));
      if (!ir.ok || ij.code !== 0) {
        // 專案已建立、改編失敗 → 仍帶去看板讓使用者重試匯入（不留孤兒感）
        toast.error((ij?.message ?? '改編失敗') + '；已建立專案，可在看板重試匯入');
        router.push(`/studio/${id}`);
        return;
      }
      toast.success('已從影片建立專案並改編分鏡 🎬');
      router.push(`/studio/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗');
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-900">
            <PiYoutubeLogoFill className="h-5 w-5 flex-none text-red-500" />
            <span className="truncate">從 YouTube 快速建立 · 貼一支影片就開始</span>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="flex-none text-gray-400 transition-colors hover:text-gray-600">
            <PiXBold className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
            <PiInfoBold className="mt-0.5 h-4 w-4 flex-none" />
            <span>一步建立專案並依來源的<b>敘事結構與節奏</b>改編成<b>內容原創</b>的分鏡（不逐字照抄）。想逐鏡審核再建立，可先建專案、用看板裡的「YouTube 改編」。</span>
          </div>
          {aiReady === false && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <PiWarningBold className="mt-0.5 h-4 w-4 flex-none" />
              <span>此功能需要 AI，但系統目前<b>尚未設定 AI</b>（需 <code>LLM_PROVIDER</code> 與憑證）。</span>
            </div>
          )}

          <label className="mb-1 block text-sm font-medium text-gray-700">片名</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="片名" placeholder="例：中年阿智：$399 開箱實測" className="mb-4" inputClassName="bg-white text-gray-900 dark:bg-gray-50" />

          <label className="mb-1 block text-sm font-medium text-gray-700">① 貼上字幕逐字稿（推薦）</label>
          <Textarea value={source} onChange={(e) => setSource(e.target.value)} aria-label="字幕逐字稿" placeholder={'在 YouTube 影片下方「⋯ → 顯示轉錄稿」複製後貼上'} rows={6} className="mb-4" textareaClassName="bg-white text-gray-900 dark:bg-gray-50" />

          <label className="mb-1 block text-sm font-medium text-gray-700">② 或填 YouTube 網址</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="YouTube 網址" placeholder="https://www.youtube.com/watch?v=... 或 youtu.be/..." className="mb-4" inputClassName="bg-white text-gray-900 dark:bg-gray-50" />

          <label className="mb-1 block text-sm font-medium text-gray-700">③ 目標片長</label>
          <div className="flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((p) => {
              const active = count === shotsForDuration(p.seconds);
              return (
                <button key={p.seconds} type="button" onClick={() => setCount(shotsForDuration(p.seconds))}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-red-300 hover:text-red-700'}`}>
                  {p.label}
                </button>
              );
            })}
            <span className="self-center text-xs text-gray-400">≈ {estimatedSeconds(count)} 秒 · {count} 鏡</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-300">
          <Button variant="outline" onClick={onClose} disabled={busy} className="border-gray-300 text-gray-600">取消</Button>
          <Button onClick={() => void run()} isLoading={busy} disabled={busy || aiReady === false} className="bg-red-600 text-white hover:bg-red-700">
            <PiSparkleFill className="me-1.5 h-4 w-4" /> 建立並改編
          </Button>
        </div>
      </div>
    </Modal>
  );
}
