'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import { PiXBold, PiSparkleFill, PiClockCounterClockwiseBold, PiImageSquareBold } from 'react-icons/pi';
import dayjs from 'dayjs';
import { Modal } from '@/components/modal';

interface VersionMeta { kind?: string; instruction?: string | null; hasMask?: boolean }
interface VersionDto { id: string; stage: string; createdAt: string; selected?: boolean; meta?: VersionMeta | null }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (iso: string) => dayjs(iso).format('MM/DD HH:mm:ss'); // 與 gallery/history 一致的 MM/DD 風格（保留秒以區分同分鐘版本）
const kindLabel = (k?: string) =>
  k === 'inpaint' ? '局部重繪' : k === 'img2img' ? '洗圖' : k === 'upload' ? '上傳' : k === 'faceid' ? '參考重繪' : '生圖';

/**
 * 洗圖工作台：在現有關鍵幀上做「整張微調 img2img」或「圈選局部重繪 inpaint」，
 * 產生新版本（不覆蓋現役），可前後比較、挑選 OK 的圖、或回挑歷史版本設為關鍵幀。
 */
export function RefineModal({
  shotId,
  shotNo,
  onClose,
  onApplied,
}: {
  shotId: string;
  shotNo: number;
  onClose: () => void;
  /** 採用某版本（設為關鍵幀）後呼叫，讓父層刷新關鍵幀預覽 */
  onApplied: () => void;
}) {
  const [versions, setVersions] = useState<VersionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState('');
  const [denoise, setDenoise] = useState(0.45);
  const [brush, setBrush] = useState(36);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const natural = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const keyframes = versions.filter((v) => v.stage === 'keyframe');
  const current = keyframes.find((v) => v.selected) ?? keyframes[0] ?? null;
  const focused = keyframes.find((v) => v.id === focusedId) ?? null;
  const baseUrl = current ? `/api/v1/studio/versions/${current.id}/file` : `/api/v1/studio/shots/${shotId}/keyframe`;
  // inpaint 模式：有圈選遮罩；否則整張 img2img。slider 預設值跟著模式走，但使用者可覆寫。
  const mode: 'inpaint' | 'img2img' = hasStrokes ? 'inpaint' : 'img2img';

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/studio/shots/${shotId}/versions`);
      const json = await res.json();
      if (res.ok && json.data) setVersions((json.data.versions ?? []) as VersionDto[]);
      else toast.error(json.message ?? '載入版本失敗');
    } catch { toast.error('載入版本失敗'); }
    setLoading(false);
  }, [shotId]);
  useEffect(() => { void load(); }, [load]);

  // ── 遮罩畫布 ──
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    natural.current = { w: img.naturalWidth || 832, h: img.naturalHeight || 1216 };
    const c = maskRef.current;
    if (c) { c.width = natural.current.w; c.height = natural.current.h; }
    clearMask();
  };
  const clearMask = () => {
    const c = maskRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setHasStrokes(false);
  };
  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = maskRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const sx = c.width / rect.width;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * (c.height / rect.height);
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, (brush * sx) / 2, 0, Math.PI * 2);
    ctx.fill();
    setHasStrokes(true);
  };
  const exportMask = (): Promise<Blob | null> => new Promise((resolve) => {
    const src = maskRef.current;
    if (!src) return resolve(null);
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const ctx = out.getContext('2d');
    if (!ctx) return resolve(null);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, out.width, out.height); // 黑底=保留
    ctx.drawImage(src, 0, 0); // 白色筆刷=要改
    out.toBlob((b) => resolve(b), 'image/png');
  });

  // ── 洗圖 ──
  const refine = async () => {
    if (!current && mode === 'img2img' && !instruction.trim()) { toast.error('請先生圖，或輸入微調指令'); return; }
    if (mode === 'img2img' && !instruction.trim()) { toast.error('請輸入微調指令，或圈選區域做局部重繪'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('mode', mode);
      if (instruction.trim()) fd.append('instruction', instruction.trim());
      fd.append('denoise', String(denoise));
      if (current) fd.append('baseVersionId', current.id);
      if (mode === 'inpaint') {
        const blob = await exportMask();
        if (!blob) { toast.error('遮罩輸出失敗'); setBusy(false); return; }
        fd.append('mask', blob, 'mask.png');
      }
      const res = await fetch(`/api/v1/studio/shots/${shotId}/refine`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? '排入洗圖失敗');
      toast.success('已排入洗圖，生成中…');
      const known = new Set(keyframes.map((v) => v.id));
      void pollForNew(known);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '洗圖失敗');
    }
    setBusy(false);
  };

  // 排入後輪詢版本列，等新版本出現 → 自動聚焦做前後比較。
  const pollForNew = async (known: Set<string>) => {
    setPolling(true);
    for (let i = 0; i < 80 && !cancelled.current; i++) {
      await sleep(2500);
      try {
        const res = await fetch(`/api/v1/studio/shots/${shotId}/versions`);
        const json = await res.json();
        const list = (json?.data?.versions ?? []) as VersionDto[];
        const fresh = list.filter((v) => v.stage === 'keyframe' && !known.has(v.id));
        if (fresh.length) {
          if (cancelled.current) return;
          setVersions(list);
          setFocusedId(fresh[0].id);
          setPolling(false);
          toast.success('洗圖完成，請比較前後再採用');
          return;
        }
      } catch { /* keep polling */ }
    }
    if (!cancelled.current) { setPolling(false); toast('仍在生成中，稍後可在版本列查看', { icon: '⏳' }); }
  };

  // ── 採用某版本當關鍵幀 ──
  const select = async (versionId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/shots/${shotId}/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? '採用失敗');
      toast.success('已設為關鍵幀');
      await load();
      setFocusedId(null);
      onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '採用失敗');
    }
    setBusy(false);
  };

  const fileUrl = (v: VersionDto) => `/api/v1/studio/versions/${v.id}/file`;
  const working = busy || polling;

  return (
    <Modal isOpen onClose={onClose} size="xl">
      <div className="max-h-[88vh] overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <PiSparkleFill className="h-5 w-5 text-violet-500" /> 分鏡 #{shotNo} 洗圖工作台
          </h3>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 hover:text-gray-600">
            <PiXBold className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-violet-500 border-r-transparent" />
          </div>
        ) : !current ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
            <PiImageSquareBold className="h-9 w-9 text-gray-300" />
            這一鏡還沒有關鍵幀。請先在編輯視窗按「① 生圖」，再回來洗圖。
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_1fr]">
              {/* 左：基底圖 + 遮罩畫布 */}
              <div>
                <div className="relative inline-block w-full select-none overflow-hidden rounded-lg border border-gray-200 dark:border-gray-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={baseUrl} alt="目前關鍵幀" onLoad={onImgLoad} className="block w-full" draggable={false} />
                  <canvas
                    ref={maskRef}
                    className="absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-50 mix-blend-screen"
                    style={{ background: 'transparent' }}
                    onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); paint(e); }}
                    onPointerMove={paint}
                    onPointerUp={() => { drawing.current = false; }}
                    onPointerLeave={() => { drawing.current = false; }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <span>筆刷</span>
                  <input type="range" min={10} max={120} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="flex-1 accent-violet-500" aria-label="筆刷大小" />
                  <Button size="sm" variant="outline" onClick={clearMask} disabled={!hasStrokes}>清除圈選</Button>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                  {hasStrokes
                    ? '已圈選 → 局部重繪（inpaint）：只重畫塗白區域，其餘維持不動。'
                    : '在圖上塗抹要修改的區域做「局部重繪」；不塗則對整張做「微調」。'}
                </p>
              </div>

              {/* 右：指令 + 幅度 + 洗圖 */}
              <div className="flex flex-col gap-3">
                <Textarea
                  label="微調指令（追加到畫面描述；英文 tag 效果最好）"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  placeholder="e.g. much fatter belly, more sweat, out of breath"
                  textareaClassName="ring-0"
                  disabled={working}
                />
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-gray-700">
                    <span>改動幅度（denoise）</span>
                    <span className="tabular-nums text-violet-600 dark:text-violet-300">{denoise.toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min={0.2} max={1} step={0.05} value={denoise}
                    onChange={(e) => setDenoise(Number(e.target.value))}
                    className="w-full accent-violet-500" aria-label="改動幅度"
                    disabled={working}
                  />
                  <div className="flex justify-between text-[10px] text-gray-400"><span>越小越像原圖</span><span>越大改越多</span></div>
                </div>
                <div className="rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                  目前模式：<b>{mode === 'inpaint' ? '局部重繪 inpaint（已圈選）' : '整張微調 img2img'}</b>
                </div>
                <Button
                  onClick={() => void refine()}
                  isLoading={working}
                  disabled={working}
                  className="bg-violet-600 text-white hover:bg-violet-700 dark:hover:bg-violet-700"
                >
                  <PiSparkleFill className="me-1.5 h-4 w-4" /> {polling ? '生成中…' : busy ? '排入中…' : '洗圖'}
                </Button>
                {polling && <p className="text-center text-[11px] text-gray-400">洗圖在 GPU 佇列中執行，完成後新版本會自動出現於下方並開啟比較。</p>}
              </div>
            </div>

            {/* 前後比較 */}
            {focused && current && focused.id !== current.id && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20">
                <div className="mb-2 text-sm font-medium text-gray-700">前後比較</div>
                <div className="grid grid-cols-2 gap-3">
                  <figure className="m-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(current)} alt="原本" className="w-full rounded border border-gray-200 object-contain dark:border-gray-300" />
                    <figcaption className="mt-1 text-center text-xs text-gray-500">原本（現役）</figcaption>
                  </figure>
                  <figure className="m-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(focused)} alt="洗圖後" className="w-full rounded border border-violet-300 object-contain" />
                    <figcaption className="mt-1 text-center text-xs text-violet-600 dark:text-violet-300">
                      洗圖後 · {kindLabel(focused.meta?.kind)}
                    </figcaption>
                  </figure>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setFocusedId(null)} disabled={working}>保留原本</Button>
                  <Button size="sm" onClick={() => void select(focused.id)} disabled={working} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    ✓ 用這張當關鍵幀
                  </Button>
                </div>
              </div>
            )}

            {/* 版本歷史 strip */}
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <PiClockCounterClockwiseBold className="h-4 w-4 text-blue-500" /> 版本歷史（{keyframes.length}）— 點圖比較，可挑歷史版本採用
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {keyframes.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setFocusedId(v.id === current?.id ? null : v.id)}
                    title={`${v.meta?.instruction ? `「${v.meta.instruction}」· ` : ''}${fmt(v.createdAt)}`}
                    className={`group relative w-24 flex-none overflow-hidden rounded border-2 ${
                      v.selected ? 'border-emerald-500' : v.id === focusedId ? 'border-violet-500' : 'border-transparent'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(v)} alt={fmt(v.createdAt)} className="aspect-[3/4] w-full object-cover" />
                    <span className="absolute inset-x-0 top-0 flex justify-between px-1 py-0.5 text-[9px] text-white">
                      <span className="rounded bg-black/55 px-1">{kindLabel(v.meta?.kind)}</span>
                      {v.selected && <span className="rounded bg-emerald-600 px-1">現役</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
}
