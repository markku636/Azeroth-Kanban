'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Textarea } from 'rizzui';
import { PiXBold, PiYoutubeLogoFill, PiSparkleFill, PiInfoBold, PiTrashBold, PiArrowLeftBold, PiWarningBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { DURATION_PRESETS, shotsForDuration, estimatedSeconds } from '@/lib/studio/pacing';
import { checkStoryboard } from '@/lib/studio/storyboard-checks';

/** 前端審核用的分鏡（對齊 server PlannedShot 欄位；只放 UI 需要的）。 */
interface ReviewShot {
  visual: string;
  tts: string;
  motion?: string;
  emotion?: string;
  branch?: 'still' | 'i2v';
  caption?: string;
  punchline?: string;
  sfx?: string;
  punch?: boolean;
  punchAtFrac?: number;
  punchZoom?: number;
}

/**
 * 「YouTube 改編」：貼上 YouTube 網址或字幕逐字稿 → AI 依其敘事結構與節奏，改編成本專案的**原創**分鏡。
 * 兩階段：① 輸入來源＋目標片長 →「改編預覽」（不落庫）② 審核／微調旁白／刪不要的鏡 →「建立分鏡」。
 * 注意：URL 抓字幕為 best-effort（YouTube 常擋伺服器端抓取）；最可靠是貼上逐字稿。
 */
export function YoutubeImportModal({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('');
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'input' | 'review'>('input');
  const [shots, setShots] = useState<ReviewShot[]>([]);
  const [targetSeconds, setTargetSeconds] = useState(0);

  // ① 改編預覽（persist:false）→ 進入審核階段
  const preview = async () => {
    if (busy) return;
    if (!source.trim() && !url.trim()) { toast.error('請貼上字幕逐字稿，或填入 YouTube 網址'); return; }
    setBusy(true);
    if (count > 12) toast('長片會分批改編，約需 30～60 秒，請稍候…', { icon: '🎬' });
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/from-youtube`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() || undefined, source: source.trim() || undefined, count: Math.min(40, Math.max(1, count)), persist: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.code !== 0) throw new Error(j.message ?? '改編失敗');
      const got: ReviewShot[] = Array.isArray(j.data?.shots) ? j.data.shots : [];
      if (!got.length) throw new Error('AI 沒有產生分鏡，請換段來源或稍後再試');
      setShots(got);
      setTargetSeconds(estimatedSeconds(Math.min(40, Math.max(1, count)))); // 記下目標片長供審核健檢比對
      setPhase('review');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '改編失敗');
    } finally {
      setBusy(false);
    }
  };

  // ② 建立審核後的分鏡（把這批直接落庫、不再重跑 AI）
  const commit = async () => {
    if (busy) return;
    const keep = shots.filter((s) => (s.visual?.trim() || s.tts?.trim()));
    if (!keep.length) { toast.error('沒有可建立的分鏡'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/from-youtube`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shots: keep }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.code !== 0) throw new Error(j.message ?? '建立失敗');
      toast.success(`已建立 ${keep.length} 個分鏡 🎬`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '建立失敗');
    } finally {
      setBusy(false);
    }
  };

  const updateShot = (i: number, patch: Partial<ReviewShot>) =>
    setShots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeShot = (i: number) => setShots((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-900">
            <PiYoutubeLogoFill className="h-5 w-5 flex-none text-red-500" />
            <span className="truncate">
              {phase === 'input' ? 'YouTube 改編 · 依來源節奏產生原創分鏡' : `審核改編結果 · 共 ${shots.length} 鏡 ≈ ${estimatedSeconds(shots.length)} 秒`}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="flex-none text-gray-400 transition-colors hover:text-gray-600">
            <PiXBold className="h-4 w-4" />
          </button>
        </div>

        {phase === 'input' ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              <PiInfoBold className="mt-0.5 h-4 w-4 flex-none" />
              <span>AI 會萃取來源影片的<b>敘事結構與節奏</b>，改編成<b>內容原創</b>的分鏡（不逐字照抄、融入本專案角色/風格）。改編後會先讓你<b>預覽審核</b>再建立。<b>貼上字幕逐字稿最可靠</b>；只填網址時系統會盡量抓字幕。</span>
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
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <PiInfoBold className="mt-0.5 h-4 w-4 flex-none" />
              <span>這是 AI 依來源改編的<b>原創分鏡</b>。可就地微調<b>旁白</b>、刪掉不要的鏡，滿意後按「建立分鏡」。建立後在看板上還能繼續生成關鍵幀與逐鏡編輯。</span>
            </div>
            {(() => {
              const checks = checkStoryboard(shots, { targetSeconds }).slice(0, 5);
              if (!checks.length) return null;
              return (
                <ul className="mb-3 flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-300/30 dark:bg-amber-950/20">
                  {checks.map((c, i) => (
                    <li key={i} className={`flex items-start gap-1.5 text-xs ${c.level === 'warn' ? 'text-amber-800 dark:text-amber-200' : 'text-gray-500'}`}>
                      <PiWarningBold className={`mt-0.5 h-3.5 w-3.5 flex-none ${c.level === 'warn' ? 'text-amber-500' : 'text-gray-400'}`} />
                      <span>{c.message}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <ol className="flex flex-col gap-2">
              {shots.map((s, i) => (
                <li key={i} className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-300 dark:bg-gray-50">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-5 min-w-5 items-center justify-center rounded bg-gray-800 px-1 text-xs font-semibold text-white">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => updateShot(i, { branch: s.branch === 'i2v' ? 'still' : 'i2v' })}
                      title="切換 靜態 / 動態 i2v（動態較耐看但生成較慢）"
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                        s.branch === 'i2v'
                          ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-200'
                      }`}
                    >
                      {s.branch === 'i2v' ? '動態 i2v' : '靜態'}
                    </button>
                    {s.caption && <span className="truncate rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] text-yellow-800" title={s.caption}>大字：{s.caption}</span>}
                    {s.punch && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">反轉鏡</span>}
                    <button type="button" onClick={() => removeShot(i)} aria-label={`刪除第 ${i + 1} 鏡`} className="ml-auto flex-none text-gray-400 transition-colors hover:text-red-600">
                      <PiTrashBold className="h-4 w-4" />
                    </button>
                  </div>
                  <Textarea
                    value={s.tts}
                    onChange={(e) => updateShot(i, { tts: e.target.value })}
                    aria-label={`第 ${i + 1} 鏡旁白`}
                    placeholder="（此鏡旁白／台詞）"
                    rows={2}
                    textareaClassName="bg-white text-gray-900 dark:bg-gray-50 text-sm"
                  />
                  {s.punchline && <p className="mt-1 text-xs text-gray-500">反轉下字幕：{s.punchline}</p>}
                  {s.visual && <p className="mt-1 line-clamp-2 text-[11px] text-gray-400" title={s.visual}>畫面：{s.visual}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-300">
          {phase === 'input' ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={busy} className="border-gray-300 text-gray-600">取消</Button>
              <Button onClick={() => void preview()} isLoading={busy} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
                <PiSparkleFill className="me-1.5 h-4 w-4" /> 改編預覽
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPhase('input')} disabled={busy} className="border-gray-300 text-gray-600">
                <PiArrowLeftBold className="me-1.5 h-4 w-4" /> 重新改編
              </Button>
              <Button onClick={() => void commit()} isLoading={busy} disabled={busy || !shots.length} className="bg-emerald-600 text-white hover:bg-emerald-700">
                建立 {shots.filter((s) => s.visual?.trim() || s.tts?.trim()).length} 個分鏡
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
