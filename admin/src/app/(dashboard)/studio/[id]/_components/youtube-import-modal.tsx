'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Textarea } from 'rizzui';
import { PiXBold, PiYoutubeLogoFill, PiSparkleFill, PiInfoBold, PiTrashBold, PiArrowLeftBold, PiWarningBold, PiArrowUpBold, PiArrowDownBold, PiArrowsClockwiseBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { DURATION_PRESETS, shotsForDuration, estimatedSeconds, estimateStoryboardSeconds } from '@/lib/studio/pacing';
import { checkStoryboard, CAPTION_MAX } from '@/lib/studio/storyboard-checks';

// 風格快選：沿用來源＝不帶 hint；其餘把風格傾向帶進改編（優先於來源原本調性）。
const STYLE_PRESETS: { label: string; hint: string }[] = [
  { label: '沿用來源', hint: '' },
  { label: '迷因吐槽', hint: '改編成迷因吐槽搞笑風格：情緒誇張、用 setup→反轉的爆點結構，多放大字幕與卡點音效。' },
  { label: '溫馨勵志', hint: '改編成溫馨勵志風格：情感真摯、節奏舒緩、結尾給人溫暖或啟發。' },
  { label: '懸疑反轉', hint: '改編成懸疑風格：開場拋出懸念、中段堆疊張力、結尾一個意想不到的反轉。' },
  { label: '知識科普', hint: '改編成知識科普風格：條理清楚、每一鏡給一個新資訊點、口吻專業但好懂。' },
];

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
  const [styleHint, setStyleHint] = useState(''); // 風格傾向（空＝沿用來源）
  const [sceneName, setSceneName] = useState(''); // 選填：把這批分鏡放進新場景（空＝未分場）
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'input' | 'review'>('input');
  const [shots, setShots] = useState<ReviewShot[]>([]);
  const [targetSeconds, setTargetSeconds] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [aiReady, setAiReady] = useState<boolean | null>(null); // null=檢查中；false=AI 未設定

  // 上線前預檢：AI 沒設定就在輸入階段先講清楚（免得使用者填半天、甚至等抓完字幕才報錯）。
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/studio/config')
      .then((r) => r.json())
      .then((j) => { if (alive) setAiReady(j?.code === 0 ? Boolean(j.data?.aiEnabled) : true); })
      .catch(() => { if (alive) setAiReady(true); }); // 查不到就不擋（維持原本點了才報錯的行為）
    return () => { alive = false; };
  }, []);

  // 點健檢提示 → 捲到對應的分鏡並短暫高亮，讓提示可執行。
  const jumpToShot = (idx: number) => {
    setHighlightIndex(idx);
    document.getElementById(`review-shot-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setHighlightIndex((cur) => (cur === idx ? null : cur)), 1600);
  };

  // ① 改編預覽（persist:false）→ 進入審核階段
  const preview = async () => {
    if (busy) return;
    if (!source.trim() && !url.trim()) { toast.error('請貼上字幕逐字稿，或填入 YouTube 網址'); return; }
    setBusy(true);
    if (count > 12) toast('長片會分批改編，約需 30～60 秒，請稍候…', { icon: '🎬' });
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/from-youtube`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() || undefined, source: source.trim() || undefined, count: Math.min(40, Math.max(1, count)), styleHint: styleHint || undefined, persist: false }),
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
        body: JSON.stringify({ shots: keep, sceneTitle: sceneName.trim() || undefined }),
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
  const addShot = () => setShots((prev) => [...prev, { visual: '', tts: '', branch: 'still' }]);

  // 逐鏡「換一個」：請 AI 依前後鏡產生一個不同但更好的替代版本，替換該鏡（一次只換一鏡）。
  const [rewriting, setRewriting] = useState<number | null>(null);
  const rewriteOne = async (i: number) => {
    if (rewriting !== null || busy) return;
    setRewriting(i);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/rewrite-shot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: shots[i], prevTts: shots[i - 1]?.tts, nextTts: shots[i + 1]?.tts }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.code !== 0 || !j.data?.shot) throw new Error(j.message ?? '重寫失敗');
      setShots((prev) => prev.map((s, idx) => (idx === i ? (j.data.shot as ReviewShot) : s)));
      toast.success('已換一個版本');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重寫失敗');
    } finally {
      setRewriting(null);
    }
  };
  // 上下調整分鏡順序（2 分鐘片的起承轉合很吃順序）。
  const moveShot = (i: number, dir: -1 | 1) =>
    setShots((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-900">
            <PiYoutubeLogoFill className="h-5 w-5 flex-none text-red-500" />
            <span className="truncate">
              {phase === 'input' ? 'YouTube 改編 · 依來源節奏產生原創分鏡' : `審核改編結果 · 共 ${shots.length} 鏡 ≈ ${estimateStoryboardSeconds(shots)} 秒`}
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
            {aiReady === false && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                <PiWarningBold className="mt-0.5 h-4 w-4 flex-none" />
                <span>此功能需要 AI 才能改編，但系統目前<b>尚未設定 AI</b>（需設定 <code>LLM_PROVIDER</code> 與對應憑證）。設定後再回來使用。</span>
              </div>
            )}

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
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy && aiReady !== false) { e.preventDefault(); void preview(); } }}
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
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy && aiReady !== false) { e.preventDefault(); void preview(); } }}
                aria-label="分鏡數量"
                className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:bg-gray-50"
              />
              <span className="text-xs text-gray-400">≈ {estimatedSeconds(count)} 秒 · {count} 鏡{count > 12 ? '（分批改編，會多花點時間）' : ''}</span>
            </div>

            <label className="mb-1 mt-4 block text-sm font-medium text-gray-700">④ 風格（沿用來源的節奏，換成你要的調性）</label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((p) => {
                const active = styleHint === p.hint;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setStyleHint(p.hint)}
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
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <PiInfoBold className="mt-0.5 h-4 w-4 flex-none" />
              <span>這是 AI 依來源改編的<b>原創分鏡</b>。可就地微調<b>旁白</b>、刪掉不要的鏡，滿意後按「建立分鏡」。建立後在看板上還能繼續生成關鍵幀與逐鏡編輯。</span>
            </div>
            {(() => {
              const all = checkStoryboard(shots, { targetSeconds });
              if (!all.length) return null;
              const checks = all.slice(0, 5);
              const more = all.length - checks.length;
              return (
                <ul className="mb-3 flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-300/30 dark:bg-amber-950/20">
                  {checks.map((c, i) => {
                    const jumpable = typeof c.shotIndex === 'number';
                    return (
                      <li key={i} className={`flex items-start gap-1.5 text-xs ${c.level === 'warn' ? 'text-amber-800 dark:text-amber-200' : 'text-gray-500'}`}>
                        <PiWarningBold className={`mt-0.5 h-3.5 w-3.5 flex-none ${c.level === 'warn' ? 'text-amber-500' : 'text-gray-400'}`} />
                        {jumpable ? (
                          <button type="button" onClick={() => jumpToShot(c.shotIndex as number)} className="text-left underline decoration-dotted underline-offset-2 hover:opacity-80">
                            {c.message}
                          </button>
                        ) : (
                          <span>{c.message}</span>
                        )}
                      </li>
                    );
                  })}
                  {more > 0 && <li className="pl-5 text-xs text-gray-400">還有 {more} 項提醒（修好上面幾項後會更新）</li>}
                </ul>
              );
            })()}
            <ol className="flex flex-col gap-2">
              {shots.map((s, i) => (
                <li
                  key={i}
                  id={`review-shot-${i}`}
                  className={`rounded-lg border bg-white p-2.5 transition-all dark:bg-gray-50 ${
                    highlightIndex === i ? 'border-amber-400 ring-2 ring-amber-300' : 'border-gray-200 dark:border-gray-300'
                  }`}
                >
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
                    {s.punch && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">反轉鏡</span>}
                    <div className="ml-auto flex flex-none items-center gap-0.5">
                      <button type="button" onClick={() => void rewriteOne(i)} disabled={rewriting !== null || busy} aria-label={`第 ${i + 1} 鏡換一個`} title="AI 換一個版本（依前後鏡重寫這一鏡）" className="me-1 text-gray-400 transition-colors hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400">
                        <PiArrowsClockwiseBold className={`h-3.5 w-3.5 ${rewriting === i ? 'animate-spin' : ''}`} />
                      </button>
                      <button type="button" onClick={() => moveShot(i, -1)} disabled={i === 0} aria-label={`第 ${i + 1} 鏡上移`} className="text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400">
                        <PiArrowUpBold className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveShot(i, 1)} disabled={i === shots.length - 1} aria-label={`第 ${i + 1} 鏡下移`} className="text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400">
                        <PiArrowDownBold className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeShot(i)} aria-label={`刪除第 ${i + 1} 鏡`} className="ms-1 text-gray-400 transition-colors hover:text-red-600">
                        <PiTrashBold className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <Textarea
                    value={s.tts}
                    onChange={(e) => updateShot(i, { tts: e.target.value })}
                    aria-label={`第 ${i + 1} 鏡旁白`}
                    placeholder="（此鏡旁白／台詞）"
                    rows={2}
                    textareaClassName="bg-white text-gray-900 dark:bg-gray-50 text-sm"
                  />
                  {s.caption !== undefined && (
                    <CaptionField label="大字幕" value={s.caption} onChange={(v) => updateShot(i, { caption: v })} />
                  )}
                  {s.punchline !== undefined && (
                    <CaptionField label="反轉字幕" value={s.punchline} onChange={(v) => updateShot(i, { punchline: v })} />
                  )}
                  {s.visual && <p className="mt-1 line-clamp-2 text-[11px] text-gray-400" title={s.visual}>畫面：{s.visual}</p>}
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={addShot}
              className="mt-2 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 transition-colors hover:border-red-300 hover:text-red-700 dark:border-gray-300"
            >
              ＋ 新增一鏡（補轉場／收尾）
            </button>
            <div className="mt-3 flex items-center gap-2">
              <label className="flex-none text-xs text-gray-500">放進場景（選填）</label>
              <input
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                aria-label="新場景名稱"
                placeholder="留空＝未分場；填名稱＝建一個新場景放這批分鏡"
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:bg-gray-50"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-300">
          {phase === 'input' ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={busy} className="border-gray-300 text-gray-600">取消</Button>
              <Button onClick={() => void preview()} isLoading={busy} disabled={busy || aiReady === false} className="bg-red-600 text-white hover:bg-red-700">
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

/** 審核階段的大字幕／反轉字幕就地編輯（含 14 字建議上限的即時字數提示）。 */
function CaptionField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const over = value.trim().length > CAPTION_MAX;
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className="w-12 flex-none text-[11px] text-gray-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={`（${label}，越短越有力）`}
        className={`min-w-0 flex-1 rounded border bg-white px-1.5 py-0.5 text-xs text-gray-900 dark:bg-gray-50 ${over ? 'border-amber-400' : 'border-gray-200'}`}
      />
      <span className={`flex-none text-[10px] ${over ? 'text-amber-600' : 'text-gray-300'}`}>{value.trim().length}/{CAPTION_MAX}</span>
    </div>
  );
}
