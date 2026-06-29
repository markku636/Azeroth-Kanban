'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge, Button } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiSparkleFill, PiPlusBold, PiPlayFill, PiPencilSimpleLineBold,
  PiDotsSixVerticalBold, PiFilmSlateDuotone, PiImageSquareBold, PiFilmReelBold, PiMusicNotesBold,
  PiCaretLeftBold, PiVideoFill, PiClockCounterClockwiseBold, PiCopySimpleBold, PiListChecksBold, PiTrashBold, PiSpeakerHighBold,
  PiYoutubeLogoFill, PiWarningCircleBold, PiGaugeBold, PiLightningBold,
} from 'react-icons/pi';
import { usePrompt } from '@/hooks/use-prompt';
import { useConfirm } from '@/hooks/use-confirm';
import { InterviewChat } from './_components/interview-chat';
import { ShotEditModal } from './_components/shot-edit-modal';
import { HistoryModal } from './_components/history-modal';
import { ScriptPreviewModal } from './_components/script-preview-modal';
import { VideoModal } from '../_components/video-modal';
import { YouTubeMetaModal } from './_components/youtube-meta-modal';
import { AuditModal } from './_components/audit-modal';
import { MediaModal } from '../_components/media-modal';

/** SSR-safe layout effect：伺服器端退回 useEffect，避免 useLayoutEffect 的 SSR 警告。 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 把毫秒格式化成 m:ss。 */
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 粗估單鏡秒數（僅供抓短影音節奏，非精準）。有語音/字幕的鏡以字數估語速（中文約 4.5 字/秒）
 * 加一截尾巴；純畫面鏡用 fallback（i2v 真動態略長）。對齊引擎：voice 時 = 語音長度+pad，無 voice 時 = fallbackDur。
 */
function estShotSeconds(s: { tts: string | null; caption: string | null; punchline: string | null; branch: string }): number {
  const text = (s.tts?.trim() || [s.caption, s.punchline].filter(Boolean).join('，')).trim();
  if (text) return Math.min(12, Math.max(1.5, text.length / 4.5)) + 0.4;
  return s.branch === 'i2v' ? 4.0 : 3.8;
}

/** 乾淨的細邊框旋轉 spinner（取代 rizzui 預設那顆放射狀 spinner，色彩跟隨 text 色）。尺寸由 className 指定（h-/w-）。 */
function Spinner({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

interface ShotDto {
  id: string; shotNo: number;
  visual: string | null; tts: string | null; motion?: string | null; emotion?: string | null;
  status: string; branch: string; sceneId: string | null;
  keyframePath: string | null; refImage: string | null; keyframeMode: string;
  caption: string | null; punchline: string | null; sfx: string | null; punch: boolean;
  punchAtFrac: number | null; punchZoom: number | null;
  characterId?: string | null;
  updatedAt: string;
  hasClip?: boolean;
}
interface SceneDto { id: string; title: string; sortOrder: number; shots: ShotDto[]; hasOutput?: boolean; outputUpdatedAt?: string | null }
interface ProjectDto { id: string; title: string; status: string; aspect: string; fps: number; renderQuality: string | null; bgmPath: string | null; hasOutput: boolean; outputUpdatedAt: string | null }
interface Storyboard { project: ProjectDto; scenes: SceneDto[] }
interface Prog { stage: string; pct?: number; status?: string }
type Gen = 'idle' | 'running' | 'gated' | 'generating' | 'done' | 'error';
type BadgeColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'danger';

const STATUS_META: Record<string, { color: BadgeColor; label: string }> = {
  DRAFT: { color: 'secondary', label: '草稿' },
  KEYFRAME: { color: 'info', label: '關鍵幀' },
  VOICE: { color: 'info', label: '配音' },
  VIDEO: { color: 'primary', label: '影片' },
  NEEDS_REVIEW: { color: 'warning', label: '待核可' },
  READY: { color: 'success', label: '完成' },
};

function DroppableScene({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex w-72 flex-none flex-col rounded-lg p-3 ${isOver ? 'bg-blue-50 ring-2 ring-blue-300 dark:bg-blue-950/30' : 'bg-gray-50 dark:bg-gray-100'}`}>
      {children}
    </div>
  );
}

/** 幕欄拖曳把手：拖到另一幕欄上即重新排序（與分鏡拖曳並存，id 前綴 scene- 區分）。 */
function SceneDragHandle({ sceneId }: { sceneId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `scene-${sceneId}` });
  return (
    <span ref={setNodeRef} {...attributes} {...listeners} className={`flex-none cursor-grab select-none text-gray-300 hover:text-gray-500 ${isDragging ? 'opacity-50' : ''}`} title="拖曳調整幕順序" aria-label="拖曳調整幕順序">
      <PiDotsSixVerticalBold className="h-4 w-4" />
    </span>
  );
}

function SortableShotCard({ shot, label, active, pct, disabled, rowIndex, minHeight, characterName, isHook, selectMode, selected, onToggleSelect, onRegenKf, onRegenVideo, onEdit, onHistory, onPreview, onClone }: { shot: ShotDto; label: string; active?: boolean; pct?: number; disabled: boolean; rowIndex: number; minHeight?: number; characterName?: string; isHook?: boolean; selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void; onRegenKf: () => void; onRegenVideo: () => void; onEdit: () => void; onHistory: () => void; onPreview: (tab: 'image' | 'video') => void; onClone: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, minHeight: minHeight ? `${minHeight}px` : undefined };
  const meta = STATUS_META[shot.status] ?? { color: 'secondary' as BadgeColor, label: shot.status };
  const hasClip = shot.hasClip ?? (shot.status === 'VIDEO' || shot.status === 'READY');
  return (
    <div ref={setNodeRef} style={style} data-shot-card data-row={rowIndex} className={`group rounded-lg border bg-white p-2 text-sm shadow-sm transition-shadow hover:shadow-md dark:bg-gray-50 ${selected ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200 dark:border-gray-200'}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
          {selectMode && (
            <input type="checkbox" aria-label="選取分鏡" checked={!!selected} onChange={onToggleSelect} className="h-3.5 w-3.5 rounded" />
          )}
          <span {...attributes} {...listeners} className="cursor-grab select-none text-gray-300 hover:text-gray-500"><PiDotsSixVerticalBold className="h-3.5 w-3.5" /></span>
          #{shot.shotNo}
          {isHook && (
            <span title="開場鉤子：短影音前 3 秒決定成敗。把最吸睛的畫面／衝突／提問放在這一鏡。" className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1 py-px text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <PiLightningBold className="h-2.5 w-2.5" />鉤子
            </span>
          )}
          {(shot.punch || shot.caption) && <span title="喜劇鏡（迷因吐槽）">🎬</span>}
          {shot.keyframeMode === 'upload' && <span title="上傳圖直接當關鍵幀">📎</span>}
          {shot.keyframeMode === 'faceid' && <span title="參考圖重繪">🎭</span>}
        </span>
        <span className="flex items-center gap-1">
          {active && <Spinner className="h-3 w-3 text-blue-500" />}
          <Badge color={meta.color} variant="flat" size="sm" className="whitespace-nowrap">{label}</Badge>
          <button type="button" onClick={onClone} disabled={disabled} aria-label="複製分鏡" title="複製此分鏡" className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-blue-600 group-hover:opacity-100 disabled:opacity-30 dark:hover:bg-gray-200">
            <PiCopySimpleBold className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onHistory} aria-label="查看生成歷史" title="查看生成歷史" className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-blue-600 group-hover:opacity-100 dark:hover:bg-gray-200">
            <PiClockCounterClockwiseBold className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onEdit} aria-label="編輯分鏡" className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-blue-600 group-hover:opacity-100 dark:hover:bg-gray-200">
            <PiPencilSimpleLineBold className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {pct != null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded bg-gray-100">
          <div className="h-full bg-blue-500 transition-[width]" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
      )}
      {shot.keyframePath && (
        <div className="relative mt-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/v1/studio/shots/${shot.id}/keyframe?v=${encodeURIComponent(shot.updatedAt)}`}
            alt={`分鏡 ${shot.shotNo} 關鍵幀`}
            className="aspect-video w-full cursor-zoom-in rounded object-cover"
            onClick={(e) => { e.stopPropagation(); onPreview('image'); }}
            title="點擊放大檢視"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          {hasClip && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPreview('video'); }}
              aria-label="播放已生成影片"
              className="absolute inset-0 flex items-center justify-center rounded bg-black/25 opacity-0 transition-opacity hover:bg-black/35 group-hover:opacity-100"
              title="播放已生成影片"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-emerald-600 shadow">
                <PiPlayFill className="h-4 w-4" />
              </span>
            </button>
          )}
        </div>
      )}
      <div className="mt-1 cursor-pointer text-gray-700 hover:text-blue-600 dark:text-gray-700" onClick={onEdit}>
        {shot.visual || <span className="text-gray-300">（點此編輯畫面／台詞）</span>}
      </div>
      {shot.tts && (
        <div className="mt-1 cursor-pointer text-xs text-gray-500 hover:text-blue-600" onClick={onEdit}>🎙 {shot.tts}</div>
      )}
      {characterName && shot.characterId && (
        <div className="mt-1 flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400" title="已指派角色（套用語音與 FaceID 一致臉）">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/v1/studio/characters/${shot.characterId}/avatar`} alt="" className="h-4 w-4 flex-none rounded-full bg-gray-100 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="truncate">🎭 {characterName}</span>
        </div>
      )}
      <div className="mt-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button type="button" onClick={onRegenKf} disabled={disabled} className="flex flex-1 items-center justify-center gap-1 rounded border border-sky-300 px-1.5 py-1 text-[11px] text-sky-700 hover:bg-sky-50 disabled:opacity-40">
          <PiImageSquareBold className="h-3 w-3" /> 生圖
        </button>
        <button type="button" onClick={onRegenVideo} disabled={disabled} className="flex flex-1 items-center justify-center gap-1 rounded border border-emerald-300 px-1.5 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
          <PiFilmReelBold className="h-3 w-3" /> 生片
        </button>
      </div>
    </div>
  );
}

export default function StoryboardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [data, setData] = useState<Storyboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [engineDown, setEngineDown] = useState(false);
  const [queuedAhead, setQueuedAhead] = useState<number | null>(null);

  const [gen, setGen] = useState<Gen>('idle');
  const [overall, setOverall] = useState<string>('');
  const [shotProg, setShotProg] = useState<Record<string, Prog>>({});
  const [finalReady, setFinalReady] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [ytOpen, setYtOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [creatingShot, setCreatingShot] = useState<{ sceneId: string | null } | null>(null);
  const [historyShot, setHistoryShot] = useState<ShotDto | null>(null);
  const [scenePreview, setScenePreview] = useState<SceneDto | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ shot: ShotDto; tab: 'image' | 'video' } | null>(null);
  const [charNames, setCharNames] = useState<Record<string, string>>({});
  const [scriptPreview, setScriptPreview] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const baseTitleRef = useRef<string>(''); // 背景分頁完成提醒：暫存原始分頁標題
  // 讓「同一排」（各幕中相同序位）的分鏡卡高度一致：量出每排最高的卡，套成該排各卡的 min-height。
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/storyboard`);
      const json = await res.json();
      if (res.ok) { setData(json.data); setFinalReady(Boolean(json.data?.project?.hasOutput)); }
      else setError(json.message ?? '載入失敗');
    } catch {
      setError('載入失敗');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // AI 助手套用提案後，發 studio:reload 事件 → 重載看板。
  useEffect(() => {
    const h = () => void load();
    window.addEventListener('studio:reload', h);
    return () => window.removeEventListener('studio:reload', h);
  }, [load]);

  // 鍵盤快捷（非破壞性，且不在輸入框時才作用）：B 批次選取 · 選取模式下 A 全選 / Esc 取消 · ? 說明。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); } else setSelectMode(true);
      } else if (e.key === 'Escape' && selectMode) {
        setSelectMode(false); setSelectedIds(new Set());
      } else if ((e.key === 'a' || e.key === 'A') && selectMode && data) {
        e.preventDefault();
        setSelectedIds(new Set(data.scenes.flatMap((s) => s.shots.map((sh) => sh.id))));
      } else if (e.key === '?') {
        e.preventDefault();
        toast('快捷鍵：B 批次選取 · 選取模式下 A 全選 / Esc 取消', { icon: '⌨️', duration: 4000 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode, data]);

  // 載入本專案角色（id→名稱），讓分鏡卡顯示已指派角色。
  const loadChars = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/characters`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.data)) {
        const map: Record<string, string> = {};
        for (const pc of j.data as { characterId: string; character: { name: string } }[]) map[pc.characterId] = pc.character.name;
        setCharNames(map);
      }
    } catch { /* 角色名稱載入失敗不影響看板 */ }
  }, [projectId]);
  useEffect(() => { void loadChars(); }, [loadChars]);
  useEffect(() => {
    const h = () => void loadChars();
    window.addEventListener('studio:reload', h);
    return () => window.removeEventListener('studio:reload', h);
  }, [loadChars]);

  // 讀取 AI 訪談是否可用（後端有沒有設定 ANTHROPIC_API_KEY）
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/studio/config');
        const json = await res.json();
        if (res.ok && json.data) setAiEnabled(Boolean(json.data.aiEnabled));
      } catch { /* 預設視為可用 */ }
    })();
  }, []);

  // 影像生成引擎（ComfyUI）就緒檢查。回傳「是否可生成」；檢查本身失敗時不阻擋（避免假警報）。
  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/studio/health', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      const comfy = json?.data?.comfyui;
      const reachable = Boolean(comfy?.reachable);
      // 只有「明確連不上」才亮紅燈；端點本身錯誤/未設定則不擾民。
      setEngineDown(comfy?.configured ? !reachable : false);
      return comfy?.configured ? reachable : true;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const t = setInterval(() => { if (!document.hidden) void checkHealth(); }, 25000);
    return () => clearInterval(t);
  }, [checkHealth]);

  // 生成期間若 GPU 正忙於「別的」工作，本工作其實是在排隊 → 誠實顯示「排隊中」而非假裝在跑。
  const generatingNow = gen === 'running' || gen === 'generating';
  useEffect(() => {
    if (!generatingNow) { setQueuedAhead(null); return; }
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/v1/studio/queue', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const d = json?.data as { active?: Array<{ projectId?: string }>; counts?: { active?: number; waiting?: number } } | undefined;
        if (stopped || !d) return;
        const mineActive = Array.isArray(d.active) && d.active.some((a) => a.projectId === projectId);
        const activeCount = d.counts?.active ?? 0;
        setQueuedAhead(!mineActive && activeCount > 0 ? activeCount + (d.counts?.waiting ?? 0) : null);
      } catch { /* 忽略：排隊提示是錦上添花，不擋主流程 */ }
    };
    void poll();
    const t = setInterval(() => { if (!document.hidden) void poll(); }, 5000);
    return () => { stopped = true; clearInterval(t); };
  }, [generatingNow, projectId]);

  // 背景分頁完成提醒：生成常要數分鐘，使用者多半切到別的分頁。完成／失敗時用分頁標題閃示
  // （免通知權限、不擾民），回到本分頁即自動還原。
  useEffect(() => {
    const restore = () => {
      if (!document.hidden && baseTitleRef.current) { document.title = baseTitleRef.current; baseTitleRef.current = ''; }
    };
    document.addEventListener('visibilitychange', restore);
    window.addEventListener('focus', restore);
    return () => { document.removeEventListener('visibilitychange', restore); window.removeEventListener('focus', restore); };
  }, []);
  const flashTitle = useCallback((msg: string) => {
    if (typeof document === 'undefined' || !document.hidden) return; // 只在背景分頁時閃示
    if (!baseTitleRef.current) baseTitleRef.current = document.title;
    document.title = msg;
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/v1/studio/projects/${projectId}/events`);
    esRef.current = es;
    es.onmessage = (ev) => {
      let e: { shotId?: string; sceneId?: string; stage: string; pct?: number; status?: string; message?: string };
      try { e = JSON.parse(ev.data); } catch { return; }
      if (e.shotId) setShotProg((p) => ({ ...p, [e.shotId as string]: { stage: e.stage, pct: e.pct, status: e.status } }));
      if (e.stage === 'plan') setOverall('規劃中…');
      else if (e.stage === 'keyframes-done') { setOverall('圖片已生成 ✅，檢視後可生成影片'); setGen('idle'); toast.success('關鍵幀已生成 🖼'); flashTitle('✅ 圖片已生成 — 影片工作室'); void load(); }
      else if (e.stage === 'assemble') { setOverall('合成成片…'); setGen('generating'); }
      else if (e.stage === 'scene-done') { setOverall('本幕影片完成 ✅'); setGen('idle'); toast.success('本幕影片完成 🎬'); flashTitle('✅ 本幕完成 — 影片工作室'); void load(); }
      else if (e.stage === 'done') { setOverall('完成 ✅'); setGen('done'); setFinalReady(true); toast.success('成片完成 🎬'); flashTitle('🎬 成片完成 — 影片工作室'); void load(); }
      else if (e.stage === 'error') { setOverall('錯誤：' + (e.message ?? '')); setGen('error'); toast.error('生成失敗：' + (e.message ?? '請查看 worker log')); flashTitle('❌ 生成失敗 — 影片工作室'); }
      else if (e.shotId) setGen('generating');
    };
    es.onerror = () => { /* auto-reconnect */ };
    return () => { es.close(); esRef.current = null; };
  }, [projectId, load, flashTitle]);

  // 量測每一「排」(各幕中相同 index 的卡) 的最高卡，並套成該排所有卡的 min-height。
  const measureRows = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const cards = Array.from(board.querySelectorAll<HTMLElement>('[data-shot-card]'));
    if (cards.length === 0) { setRowHeights({}); return; }
    for (const c of cards) c.style.minHeight = '0px'; // 先歸零，量自然高度
    const maxByRow: Record<number, number> = {};
    for (const c of cards) {
      const r = Number(c.dataset.row);
      if (c.offsetHeight > (maxByRow[r] ?? 0)) maxByRow[r] = c.offsetHeight;
    }
    // 直接套回 DOM（避免 React 在值不變時略過更新而留下 0px），同時存 state 讓後續 re-render 維持。
    for (const c of cards) c.style.minHeight = `${maxByRow[Number(c.dataset.row)]}px`;
    setRowHeights(maxByRow);
  }, []);

  // 資料變動（載入 / 拖移 / 編輯後重抓）後重新對齊；用 layout effect 在繪製前完成，避免閃動。
  useIsoLayoutEffect(() => { measureRows(); }, [data, measureRows]);

  // 視窗縮放（欄寬改變→文字換行改變→卡高改變）時重新對齊。
  useEffect(() => {
    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measureRows); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, [measureRows]);

  const addScene = async () => {
    const title = await prompt({ title: '新增場景', placeholder: '場景名稱', defaultValue: `場景 ${(data?.scenes.length ?? 0) + 1}`, confirmLabel: '新增', required: true });
    if (!title) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '新增場景失敗'); }
      toast.success('場景已新增');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '新增場景失敗');
    }
    setBusy(false);
  };

  const renameProject = async () => {
    const t = await prompt({ title: '重新命名專案', defaultValue: data?.project.title ?? '', confirmLabel: '儲存', required: true });
    if (!t || t === data?.project.title) return;
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '重新命名失敗'); }
      toast.success('已重新命名'); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '重新命名失敗'); }
  };
  const renameScene = async (sc: SceneDto) => {
    const t = await prompt({ title: '重新命名場景', defaultValue: sc.title, confirmLabel: '儲存', required: true });
    if (!t || t === sc.title) return;
    try {
      const res = await fetch(`/api/v1/studio/scenes/${sc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
      if (!res.ok) throw new Error();
      toast.success('已重新命名'); await load();
    } catch { toast.error('重新命名失敗'); }
  };
  const deleteSceneBoard = async (sc: SceneDto) => {
    const ok = await confirm({ title: '刪除場景', message: `確定刪除「${sc.title}」？其下分鏡會落到「未分場」，不會被刪除。`, type: 'danger', confirmLabel: '刪除' });
    if (!ok) return;
    const title = sc.title; const shotIds = sc.shots.map((s) => s.id);
    try {
      const res = await fetch(`/api/v1/studio/scenes/${sc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await load();
      toast((tt) => (
        <span className="flex items-center gap-2 text-sm">場景已刪除
          <button type="button" onClick={() => { toast.dismiss(tt.id); void undoScene(title, shotIds); }} className="font-medium text-blue-600 hover:underline">復原</button>
        </span>
      ), { duration: 6000 });
    } catch { toast.error('刪除失敗'); }
  };

  // 批次快速建立 n 個空白分鏡（之後可逐一編輯）
  const addManyShots = async (sceneId: string | null) => {
    const raw = await prompt({ title: '批次新增分鏡', message: '要新增幾個空白分鏡？', placeholder: '3', defaultValue: '3', confirmLabel: '新增' });
    const n = parseInt(raw ?? '0', 10);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      for (let i = 0; i < n; i++) {
        await fetch('/api/v1/studio/shots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sceneId }) });
      }
      toast.success(`已新增 ${n} 個分鏡`);
      await load();
    } catch {
      toast.error('批次新增失敗');
    }
    setBusy(false);
  };

  // AI 續寫：依本場已有分鏡接續，產生 N 個新分鏡並直接落庫（provider 由後端 LLM_PROVIDER 決定）。
  const aiContinue = async (sceneId: string | null) => {
    if (!aiEnabled) { toast('AI 未啟用：請設定 LLM_PROVIDER=vertex 與 Vertex 憑證（或 ANTHROPIC_API_KEY）', { icon: '🔒' }); return; }
    const raw = await prompt({ title: 'AI 續寫分鏡', message: 'AI 依本場已有分鏡接續，要產生幾個分鏡？（上限 12）', placeholder: '3', defaultValue: '3', confirmLabel: '產生' });
    const n = parseInt(raw ?? '0', 10);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/suggest-shots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, count: Math.min(12, n), persist: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'AI 續寫失敗');
      toast.success('AI 已新增分鏡 ✨');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 續寫失敗');
    }
    setBusy(false);
  };

  // 複製分鏡：以原鏡的文字欄位（畫面/台詞/運鏡/情緒/喜劇）建立新鏡，落同一場末端（不含生成結果）。
  const cloneShot = async (shot: ShotDto) => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/studio/shots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, sceneId: shot.sceneId,
          visual: shot.visual ?? undefined, tts: shot.tts ?? undefined, motion: shot.motion ?? undefined, emotion: shot.emotion ?? undefined,
          branch: shot.branch, caption: shot.caption ?? undefined, punchline: shot.punchline ?? undefined,
          sfx: shot.sfx && shot.sfx !== 'none' ? shot.sfx : undefined, punch: shot.punch,
          punchAtFrac: shot.punchAtFrac ?? undefined, punchZoom: shot.punchZoom ?? undefined,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '複製失敗'); }
      toast.success('已複製分鏡');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '複製失敗'); }
    setBusy(false);
  };

  // ── 批次選取 ──
  const toggleSelect = (id: string) => setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const bulkGen = async (kind: 'keyframes' | 'render') => {
    const ids = Array.from(selectedIds); if (!ids.length) return;
    setShotProg({}); setGen(kind === 'keyframes' ? 'running' : 'generating'); setOverall(`批次${kind === 'keyframes' ? '生圖' : '生片'} ${ids.length} 鏡…`);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shotIds: ids }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '排入失敗'); }
      toast.success(`已排入批次${kind === 'keyframes' ? '生圖' : '生片'}`);
    } catch (e) { setGen('error'); toast.error(e instanceof Error ? e.message : '排入失敗'); }
    exitSelect();
  };
  const bulkAssign = async (characterId: string) => {
    const ids = Array.from(selectedIds); if (!ids.length || !characterId) return;
    setBusy(true);
    try {
      for (const id of ids) await fetch(`/api/v1/studio/shots/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId }) });
      toast.success(`已指派角色給 ${ids.length} 鏡`); await load(); await loadChars(); exitSelect();
    } catch { toast.error('批次指派失敗'); }
    setBusy(false);
  };
  // 復原：以擷取的分鏡文字欄位重建（新 id，不含已生成的圖/片 — soft undo）。
  const recreateShot = (sh: ShotDto) => fetch('/api/v1/studio/shots', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, sceneId: sh.sceneId, visual: sh.visual ?? undefined, tts: sh.tts ?? undefined, motion: sh.motion ?? undefined, emotion: sh.emotion ?? undefined, branch: sh.branch, caption: sh.caption ?? undefined, punchline: sh.punchline ?? undefined, sfx: sh.sfx && sh.sfx !== 'none' ? sh.sfx : undefined, punch: sh.punch, punchAtFrac: sh.punchAtFrac ?? undefined, punchZoom: sh.punchZoom ?? undefined }),
  });
  const undoShots = async (shots: ShotDto[]) => {
    try { for (const sh of shots) await recreateShot(sh); toast.success(`已復原 ${shots.length} 個分鏡`); await load(); }
    catch { toast.error('復原失敗'); }
  };
  const undoScene = async (title: string, shotIds: string[]) => {
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      const j = await res.json().catch(() => ({}));
      const newId = j.data?.id;
      if (newId) for (const sid of shotIds) await fetch(`/api/v1/studio/shots/${sid}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId: newId }) });
      toast.success('場景已復原'); await load();
    } catch { toast.error('復原失敗'); }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds); if (!ids.length) return;
    const ok = await confirm({ title: '批次刪除分鏡', message: `確定刪除選取的 ${ids.length} 個分鏡？刪除後可按「復原」重建（不含已生成的圖／片）。`, type: 'danger', confirmLabel: '刪除' });
    if (!ok) return;
    const captured = data ? data.scenes.flatMap((s) => s.shots).filter((sh) => selectedIds.has(sh.id)) : [];
    setBusy(true);
    try {
      for (const id of ids) await fetch(`/api/v1/studio/shots/${id}`, { method: 'DELETE' });
      await load(); exitSelect();
      toast((tt) => (
        <span className="flex items-center gap-2 text-sm">已刪除 {ids.length} 個分鏡
          <button type="button" onClick={() => { toast.dismiss(tt.id); void undoShots(captured); }} className="font-medium text-blue-600 hover:underline">復原</button>
        </span>
      ), { duration: 6000 });
    } catch { toast.error('批次刪除失敗'); }
    setBusy(false);
  };

  // 切換幀率（24/30/60）。
  const updateFps = async (fps: number) => {
    if (!data || fps === data.project.fps) return;
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fps }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '更新失敗'); }
      toast.success('已更新幀率'); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '更新失敗'); }
  };

  const moveShot = async (shotId: string, sceneId: string | null, afterId: string | null) => {
    try {
      const res = await fetch(`/api/v1/studio/shots/${shotId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId, afterId }) });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('搬移分鏡失敗');
    }
    await load();
  };

  const moveSceneBoard = async (sceneId: string, afterId: string) => {
    try {
      const res = await fetch(`/api/v1/studio/scenes/${sceneId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ afterId }) });
      if (!res.ok) throw new Error();
    } catch { toast.error('調整幕順序失敗'); }
    await load();
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !data) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    // 幕欄拖曳（scene-<id>）→ 重新排序幕。
    if (activeId.startsWith('scene-')) {
      const src = activeId.slice(6);
      let tgt: string | null = null;
      if (overId.startsWith('col-')) tgt = overId.slice(4);
      else { const sc = data.scenes.find((s) => s.shots.some((sh) => sh.id === overId)); tgt = sc?.id ?? null; }
      if (tgt && tgt !== src && tgt !== '__unassigned__' && src !== '__unassigned__') void moveSceneBoard(src, tgt);
      return;
    }
    let targetSceneId: string | null = null;
    let afterId: string | null = null;
    if (overId.startsWith('col-')) {
      const sid = overId.slice(4);
      targetSceneId = sid === '__unassigned__' ? null : sid;
    } else {
      const sc = data.scenes.find((s) => s.shots.some((sh) => sh.id === overId));
      if (!sc) return;
      targetSceneId = sc.id === '__unassigned__' ? null : sc.id;
      afterId = overId; // 插在這張卡之前
    }
    void moveShot(activeId, targetSceneId, afterId);
  };

  // 切換畫幅（9:16/16:9/1:1）。影響之後生成的關鍵幀與成片尺寸；舊圖需重生才套用。
  const updateAspect = async (aspect: string) => {
    if (!data || aspect === data.project.aspect) return;
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aspect }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '更新失敗'); }
      toast.success('已更新畫幅，請按「① 生成圖片」重生以套用新尺寸');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '更新失敗'); }
  };

  // 切換成片品質（standard=720p 較快 / high=1080p 更銳利）。影響「② 生成影片」合成的畫布尺寸；改後重生影片即套用。
  const updateQuality = async (renderQuality: string) => {
    if (!data || renderQuality === (data.project.renderQuality ?? 'standard')) return;
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renderQuality }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '更新失敗'); }
      toast.success(renderQuality === 'high' ? '已切換為高品質（1080p），重生影片即套用' : '已切換為標準品質（720p，較快）');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '更新失敗'); }
  };

  const bgmInputRef = useRef<HTMLInputElement | null>(null);
  const generating = gen === 'running' || gen === 'generating';

  // 生成中：計時 + 依完成率估算剩餘時間。
  const genStartRef = useRef<number>(0);
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    if (!generating) { genStartRef.current = 0; return; }
    if (!genStartRef.current) genStartRef.current = Date.now();
    setNowTs(Date.now());
    const iv = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [generating]);

  // 階段①：生成關鍵幀圖片（先圖後片）。shotIds 省略=全部；給定=只生那些鏡。
  // 生成前置檢查：ComfyUI 連不上就別讓 job 無聲卡在佇列，給清楚提示。
  const ENGINE_DOWN_MSG = '影像生成引擎（ComfyUI）尚未就緒，先在主機啟動 ComfyUI 再生成，否則會卡在佇列。';

  const genKeyframes = async (shotIds?: string[]) => {
    if (!(await checkHealth())) { toast.error(ENGINE_DOWN_MSG, { duration: 7000 }); return; }
    setShotProg({}); setGen('running'); setOverall(shotIds ? `生成 ${shotIds.length} 鏡圖片…` : '生成全部圖片…');
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/keyframes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shotIds ? { shotIds } : {}),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '排入失敗'); }
      toast.success(shotIds ? '已排入生成圖片' : '已排入生成全部圖片');
    } catch (e) { setGen('error'); toast.error(e instanceof Error ? e.message : '排入失敗'); }
  };

  // 階段②：依關鍵幀生影片並合成整支。shotIds 省略=全部；給定=改完重生那些鏡。
  const genRender = async (shotIds?: string[]) => {
    if (!(await checkHealth())) { toast.error(ENGINE_DOWN_MSG, { duration: 7000 }); return; }
    setFinalReady(false); setGen('generating'); setOverall(shotIds ? `重生 ${shotIds.length} 鏡影片…` : '生成影片…');
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shotIds ? { shotIds } : {}),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '排入失敗'); }
      toast.success(shotIds ? '已排入重生影片' : '已排入生成影片');
    } catch (e) { setGen('error'); toast.error(e instanceof Error ? e.message : '排入失敗'); }
  };

  // 場景級：只生成並「單獨」合成這一幕的影片（不動到整支成片）。
  const genSceneRender = async (scene: SceneDto) => {
    if (scene.shots.length === 0) { toast('此幕尚無分鏡'); return; }
    if (!(await checkHealth())) { toast.error(ENGINE_DOWN_MSG, { duration: 7000 }); return; }
    setGen('generating'); setOverall(`生成「${scene.title}」影片…`);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId: scene.id }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '排入失敗'); }
      toast.success('已排入生成本幕影片');
    } catch (e) { setGen('error'); toast.error(e instanceof Error ? e.message : '排入失敗'); }
  };

  const uploadBgm = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/v1/studio/projects/${projectId}/bgm`, { method: 'POST', body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '上傳失敗'); }
      toast.success('已設定專案 BGM 🎵'); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'BGM 上傳失敗'); }
    setBusy(false);
  };

  const clearBgm = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/bgm`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('已改用程序化配樂'); await load();
    } catch { toast.error('清除失敗'); }
    setBusy(false);
  };

  const totalShots = data?.scenes.reduce((a, s) => a + s.shots.length, 0) ?? 0;
  const estSeconds = data ? data.scenes.reduce((a, s) => a + s.shots.reduce((b, sh) => b + estShotSeconds(sh), 0), 0) : 0;
  const doneShots = Object.values(shotProg).filter((p) => p.status === 'done').length;

  const shotLabel = (s: ShotDto): string => {
    const p = shotProg[s.id];
    if (p) {
      if (p.status === 'done') return `${p.stage} ✓`;
      if (p.pct != null) return `${p.stage} ${Math.round(p.pct * 100)}%`;
      return `${p.stage}${p.status ? ' ' + p.status : '…'}`;
    }
    return STATUS_META[s.status]?.label ?? s.status;
  };

  const openAi = () => {
    if (!aiEnabled) {
      toast('AI 訪談尚未啟用：請設定 ANTHROPIC_API_KEY，或用「+ 新增分鏡」手動建立', { icon: '🔒' });
      return;
    }
    setChatOpen(true);
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" /></div>;
  }
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  // 從最新 data 推導正在編輯的分鏡，讓 modal 在重新生成完成（load() 後）也能即時更新縮圖，與看板卡保持一致。
  const editingShot = editingShotId ? (data.scenes.flatMap((s) => s.shots).find((sh) => sh.id === editingShotId) ?? null) : null;

  // 縮圖底圖＝第一個有關鍵幀的分鏡（通常是鉤子鏡），供 YouTube 文案的縮圖產生器疊大字。
  const hookShot = data.scenes.flatMap((s) => s.shots).find((sh) => sh.keyframePath);
  const hookKeyframeUrl = hookShot ? `/api/v1/studio/shots/${hookShot.id}/keyframe?v=${encodeURIComponent(hookShot.updatedAt)}` : undefined;
  // 開場鉤子＝整支影片按順序的第一鏡（前 3 秒決定觀眾去留）；在看板上標記，提醒把功力下在這。
  const openingShotId = data.scenes.flatMap((s) => s.shots)[0]?.id;

  return (
    <div className="flex h-full flex-col px-2 py-2 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/studio" className="mb-1 inline-flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-blue-600">
            <PiCaretLeftBold className="h-3 w-3" /> 專案列表
          </Link>
          <h1 className="group/title flex items-center gap-2 text-2xl font-bold text-gray-900">
            {data.project.title}
            <button type="button" onClick={() => void renameProject()} aria-label="重新命名專案" title="重新命名專案" className="rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-blue-600 group-hover/title:opacity-100 dark:hover:bg-gray-200">
              <PiPencilSimpleLineBold className="h-4 w-4" />
            </button>
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <select
              aria-label="畫幅比例"
              value={data.project.aspect}
              onChange={(e) => void updateAspect(e.target.value)}
              disabled={generating || busy}
              title="切換畫幅；改後需「① 生成圖片」重生以套用新尺寸"
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-700 disabled:opacity-50 dark:bg-gray-50"
            >
              <option value="9:16">9:16 直式</option>
              <option value="16:9">16:9 橫式</option>
              <option value="1:1">1:1 方形</option>
            </select>
            <select
              aria-label="幀率"
              value={data.project.fps}
              onChange={(e) => void updateFps(Number(e.target.value))}
              disabled={generating || busy}
              title="切換幀率"
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-700 disabled:opacity-50 dark:bg-gray-50"
            >
              <option value={24}>24fps</option>
              <option value={30}>30fps</option>
              <option value={60}>60fps</option>
            </select>
            <select
              aria-label="成片品質"
              value={data.project.renderQuality ?? 'standard'}
              onChange={(e) => void updateQuality(e.target.value)}
              disabled={generating || busy}
              title="成片品質：高品質 1080p 更銳利但較慢；標準 720p 較快。改後「② 生成影片」即套用"
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-700 disabled:opacity-50 dark:bg-gray-50"
            >
              <option value="high">高品質 1080p</option>
              <option value="standard">標準 720p</option>
            </select>
            <span>· 共 {totalShots} 個分鏡</span>
            {totalShots > 0 && (
              <span
                title="粗估成片長度（依字數估語速，非精準值）。短影音黃金區間約 30–45 秒。"
                className={estSeconds > 75 || estSeconds < 15 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}
              >
                · 約 {fmtDur(estSeconds * 1000)}{estSeconds > 75 ? '（偏長）' : estSeconds < 15 ? '（偏短）' : ''}
              </span>
            )}
            {overall && <Badge color="info" variant="flat" size="sm">{overall}</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href={`/studio/${projectId}/script`} className="inline-flex items-center rounded-md border border-purple-200 px-3 py-1.5 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300" title="編輯腳本與故事場景（logline、分場大綱）">
            <PiPencilSimpleLineBold className="me-1.5 h-4 w-4" /> 腳本
          </Link>
          <Button variant="outline" onClick={openAi} disabled={busy} title={aiEnabled ? undefined : '需設定 ANTHROPIC_API_KEY'}>
            <PiSparkleFill className="me-1.5 h-4 w-4 text-purple-500" /> AI 訪談
          </Button>
          <Button variant="outline" onClick={() => void addScene()} disabled={busy}>
            <PiPlusBold className="me-1.5 h-4 w-4" /> 新增場景
          </Button>
          <Button variant="outline" onClick={() => (selectMode ? exitSelect() : setSelectMode(true))} disabled={busy} className={selectMode ? 'border-blue-400 text-blue-700 dark:border-blue-600 dark:text-blue-300' : ''}>
            <PiListChecksBold className="me-1.5 h-4 w-4" /> {selectMode ? '結束選取' : '批次選取'}
          </Button>
          <input ref={bgmInputRef} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBgm(f); e.currentTarget.value = ''; }} />
          <Button variant="outline" onClick={() => bgmInputRef.current?.click()} disabled={busy} title={data.project.bgmPath ? '已設定 BGM，點此更換' : '上傳專案 BGM（未設定則用程序化配樂）'}>
            <PiMusicNotesBold className={`me-1.5 h-4 w-4 ${data.project.bgmPath ? 'text-emerald-500' : 'text-gray-400'}`} /> {data.project.bgmPath ? 'BGM ✓' : 'BGM'}
          </Button>
          {data.project.bgmPath && (
            <button type="button" onClick={() => void clearBgm()} disabled={busy} className="text-xs text-gray-400 hover:text-red-500" title="改用程序化配樂">清除</button>
          )}
          {finalReady && (
            <Button variant="outline" onClick={() => setFinalOpen(true)} title="預覽 / 下載已生成的成片" className="border-emerald-300 text-emerald-700 hover:border-emerald-400 hover:text-emerald-800 dark:border-emerald-700 dark:text-emerald-300">
              <PiVideoFill className="me-1.5 h-4 w-4" /> 成片預覽
            </Button>
          )}
          {finalReady && aiEnabled && (
            <Button variant="outline" onClick={() => setYtOpen(true)} title="AI 產生 YouTube/抖音 上架文案（吸睛標題、說明、hashtags）" className="border-red-300 text-red-700 hover:border-red-400 hover:text-red-800 dark:border-red-800 dark:text-red-300">
              <PiYoutubeLogoFill className="me-1.5 h-4 w-4" /> YouTube 文案
            </Button>
          )}
          <Button variant="outline" onClick={() => setScriptPreview(true)} disabled={totalShots === 0} title="預覽旁白腳本並試聽（帶情緒）" className="border-sky-300 text-sky-700 hover:border-sky-400 hover:text-sky-800 dark:border-sky-700 dark:text-sky-300">
            <PiSpeakerHighBold className="me-1.5 h-4 w-4" /> 旁白預覽
          </Button>
          {aiEnabled && (
            <Button variant="outline" onClick={() => setAuditOpen(true)} disabled={totalShots === 0} title="用短影音黃金法則健檢這支影片的吸睛度，並給具體改進建議" className="border-purple-300 text-purple-700 hover:border-purple-400 hover:text-purple-800 dark:border-purple-800 dark:text-purple-300">
              <PiGaugeBold className="me-1.5 h-4 w-4" /> 影片健檢
            </Button>
          )}
          <Button variant="outline" onClick={() => void genKeyframes()} disabled={busy || generating || totalShots === 0} title="先生成每鏡關鍵幀圖片，檢視後再生影片" className="border-sky-300 text-sky-700 hover:border-sky-400 hover:text-sky-800 dark:border-sky-700 dark:text-sky-300">
            <PiImageSquareBold className="me-1.5 h-4 w-4" /> ① 生成圖片
          </Button>
          <Button onClick={() => void genRender()} disabled={busy || generating || totalShots === 0} title="依關鍵幀生成影片並合成整支" className="bg-emerald-600 text-white hover:bg-emerald-700 dark:hover:bg-emerald-700">
            <PiPlayFill className="me-1.5 h-4 w-4" /> ② 生成影片
          </Button>
        </div>
      </div>

      {!aiEnabled && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          🔒 AI 訪談未啟用（後端未設定 <code>ANTHROPIC_API_KEY</code>）。你仍可用「+ 新增分鏡 / 批次」手動建立分鏡，再按「生成影片」。
        </div>
      )}

      {engineDown && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <PiWarningCircleBold className="mt-0.5 h-4 w-4 flex-none" />
          <span>影像生成引擎（ComfyUI）目前連不上。現在按生成會卡在佇列無法完成——請先在主機啟動 ComfyUI，並避免主機進入睡眠。</span>
        </div>
      )}

      {generating && (
        <div className="mb-3">
          {queuedAhead != null && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <PiClockCounterClockwiseBold className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span>GPU 正忙於其他工作，你的工作排隊中（佇列約 {queuedAhead} 個）。輪到時會自動開始，可先離開頁面。</span>
            </div>
          )}
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500">
            <span>{queuedAhead != null ? '排隊中…' : (overall || '生成中…')}{genStartRef.current ? ` · 已 ${fmtDur(nowTs - genStartRef.current)}` : ''}</span>
            <span className="flex-none">
              {totalShots > 0 && `${doneShots} / ${totalShots} 鏡`}
              {genStartRef.current > 0 && doneShots > 0 && doneShots < totalShots
                ? ` · 約剩 ${Math.max(1, Math.ceil(((nowTs - genStartRef.current) / doneShots) * (totalShots - doneShots) / 60000))} 分`
                : ''}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-200">
            <div className="h-full rounded bg-emerald-500 transition-[width] duration-500" style={{ width: `${totalShots > 0 ? Math.min(100, Math.round((doneShots / totalShots) * 100)) : 8}%` }} />
          </div>
        </div>
      )}

      {finalReady && !generating && (
        <button
          type="button"
          onClick={() => setFinalOpen(true)}
          className="mb-3 flex w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-600 text-white"><PiPlayFill className="h-4 w-4" /></span>
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">成片已完成 — 點此預覽 / 下載</span>
        </button>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div ref={boardRef} className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {data.scenes.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-gray-400">
              <PiFilmSlateDuotone className="h-12 w-12 text-gray-300" />
              <div className="text-sm">尚無分鏡。用「✨ AI 訪談」一句話生成，或「+ 新增場景」手動開始。</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={openAi}><PiSparkleFill className="me-1.5 h-4 w-4 text-purple-500" /> AI 訪談</Button>
                <Button size="sm" onClick={() => void addScene()}><PiPlusBold className="me-1.5 h-4 w-4" /> 新增場景</Button>
              </div>
            </div>
          )}
          {data.scenes.map((sc) => (
            <DroppableScene key={sc.id} id={`col-${sc.id}`}>
              <div className="group/scene mb-2 flex items-center justify-between gap-1">
                <div className="flex min-w-0 items-center gap-1">
                  {sc.id !== '__unassigned__' && <SceneDragHandle sceneId={sc.id} />}
                  <span className="truncate font-semibold text-gray-800">{sc.title}</span>
                  {sc.id !== '__unassigned__' && (
                    <>
                      <button type="button" onClick={() => void renameScene(sc)} aria-label="重新命名場景" title="重新命名" className="flex-none rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:text-blue-600 group-hover/scene:opacity-100">
                        <PiPencilSimpleLineBold className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void deleteSceneBoard(sc)} aria-label="刪除場景" title="刪除場景" className="flex-none rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover/scene:opacity-100">
                        <PiTrashBold className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <Badge color="secondary" variant="flat" size="sm" className="flex-none">{sc.shots.length}</Badge>
              </div>
              {sc.id !== '__unassigned__' && (
                <div className="mb-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void genSceneRender(sc)}
                    disabled={generating || busy || sc.shots.length === 0}
                    title="只生成並合成這一幕的影片（可單獨預覽 / 下載）"
                    className="flex flex-1 items-center justify-center gap-1 rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-700 dark:text-emerald-300"
                  >
                    <PiFilmReelBold className="h-3.5 w-3.5" /> 生成本幕影片
                  </button>
                  {sc.hasOutput && (
                    <button
                      type="button"
                      onClick={() => setScenePreview(sc)}
                      title="預覽 / 下載本幕影片"
                      className="flex items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      <PiPlayFill className="h-3.5 w-3.5" /> 預覽
                    </button>
                  )}
                </div>
              )}
              <SortableContext items={sc.shots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2 overflow-y-auto">
                  {sc.shots.map((s, idx) => (
                    <SortableShotCard key={s.id} shot={s} label={shotLabel(s)} active={shotProg[s.id] != null && shotProg[s.id].status !== 'done'} pct={shotProg[s.id]?.status !== 'done' ? shotProg[s.id]?.pct : undefined} disabled={generating || busy} rowIndex={idx} minHeight={rowHeights[idx]} characterName={s.characterId ? charNames[s.characterId] : undefined} isHook={s.id === openingShotId} selectMode={selectMode} selected={selectedIds.has(s.id)} onToggleSelect={() => toggleSelect(s.id)} onRegenKf={() => void genKeyframes([s.id])} onRegenVideo={() => void genRender([s.id])} onEdit={() => setEditingShotId(s.id)} onHistory={() => setHistoryShot(s)} onPreview={(tab) => setMediaPreview({ shot: s, tab })} onClone={() => void cloneShot(s)} />
                  ))}
                  {sc.shots.length === 0 && <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-300">尚無分鏡</div>}
                </div>
              </SortableContext>
              {sc.id !== '__unassigned__' && (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCreatingShot({ sceneId: sc.id })} disabled={busy} className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-white disabled:opacity-50 dark:hover:bg-gray-200">
                      <PiPlusBold className="h-3 w-3" /> 新增分鏡
                    </button>
                    <button type="button" onClick={() => void addManyShots(sc.id)} disabled={busy} className="rounded border border-dashed border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-white disabled:opacity-50 dark:hover:bg-gray-200">
                      批次…
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void aiContinue(sc.id)}
                    disabled={busy}
                    title={aiEnabled ? 'AI 依本場已有分鏡接續，產生新分鏡' : '需設定 AI（LLM_PROVIDER=vertex 或 ANTHROPIC_API_KEY）'}
                    className="flex items-center justify-center gap-1 rounded border border-dashed border-purple-300 px-2 py-1.5 text-xs text-purple-700 hover:bg-purple-50 disabled:opacity-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/20"
                  >
                    <PiSparkleFill className="h-3 w-3" /> AI 續寫
                  </button>
                </div>
              )}
            </DroppableScene>
          ))}
        </div>
      </DndContext>

      {selectMode && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-xl dark:border-gray-200 dark:bg-gray-50">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-700">已選 {selectedIds.size} 鏡</span>
          <button type="button" onClick={() => void bulkGen('keyframes')} disabled={selectedIds.size === 0 || busy || generating} className="flex items-center gap-1 rounded border border-sky-300 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-40 dark:border-sky-700 dark:text-sky-300">
            <PiImageSquareBold className="h-3.5 w-3.5" /> 批次生圖
          </button>
          <button type="button" onClick={() => void bulkGen('render')} disabled={selectedIds.size === 0 || busy || generating} className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-40">
            <PiFilmReelBold className="h-3.5 w-3.5" /> 批次生片
          </button>
          {Object.keys(charNames).length > 0 && (
            <select aria-label="批次指派角色" value="" onChange={(e) => { if (e.target.value) void bulkAssign(e.target.value); }} disabled={selectedIds.size === 0 || busy} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 disabled:opacity-40 dark:bg-gray-50">
              <option value="">指派角色…</option>
              {Object.entries(charNames).map(([cid, name]) => <option key={cid} value={cid}>{name}</option>)}
            </select>
          )}
          <button type="button" onClick={() => void bulkDelete()} disabled={selectedIds.size === 0 || busy} className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400">
            <PiTrashBold className="h-3.5 w-3.5" /> 刪除
          </button>
          <button type="button" onClick={exitSelect} className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-700">完成</button>
        </div>
      )}

      {chatOpen && (
        <InterviewChat
          projectId={projectId}
          onClose={() => setChatOpen(false)}
          onDone={() => {
            setChatOpen(false);
            void load();
          }}
        />
      )}

      {editingShot && (
        <ShotEditModal
          projectId={projectId}
          shot={editingShot}
          aiEnabled={aiEnabled}
          onClose={() => setEditingShotId(null)}
          onSaved={() => {
            setEditingShotId(null);
            void load();
          }}
        />
      )}

      {creatingShot && (
        <ShotEditModal
          projectId={projectId}
          createSceneId={creatingShot.sceneId}
          aiEnabled={aiEnabled}
          onClose={() => setCreatingShot(null)}
          onSaved={() => {
            setCreatingShot(null);
            void load();
          }}
        />
      )}

      {finalOpen && (
        <VideoModal
          title={`成片預覽 · ${data.project.title}`}
          src={`/api/v1/studio/projects/${projectId}/output${data.project.outputUpdatedAt ? `?v=${encodeURIComponent(data.project.outputUpdatedAt)}` : ''}`}
          downloadName={`${data.project.title}.mp4`}
          exportProjectId={projectId}
          onClose={() => setFinalOpen(false)}
        />
      )}

      {ytOpen && <YouTubeMetaModal projectId={projectId} hookKeyframeUrl={hookKeyframeUrl} onClose={() => setYtOpen(false)} />}

      {auditOpen && <AuditModal projectId={projectId} onClose={() => setAuditOpen(false)} />}

      {historyShot && (
        <HistoryModal
          shotId={historyShot.id}
          shotNo={historyShot.shotNo}
          onClose={() => setHistoryShot(null)}
        />
      )}

      {scenePreview && (
        <VideoModal
          title={`本幕預覽 · ${scenePreview.title}`}
          src={`/api/v1/studio/scenes/${scenePreview.id}/output${scenePreview.outputUpdatedAt ? `?v=${encodeURIComponent(scenePreview.outputUpdatedAt)}` : ''}`}
          downloadName={`${data.project.title}-${scenePreview.title}.mp4`}
          onClose={() => setScenePreview(null)}
        />
      )}

      {scriptPreview && (
        <ScriptPreviewModal
          scenes={data.scenes.map((s) => ({ id: s.id, title: s.title, shots: s.shots.map((sh) => ({ id: sh.id, shotNo: sh.shotNo, tts: sh.tts, emotion: sh.emotion, characterId: sh.characterId })) }))}
          charNames={charNames}
          onClose={() => setScriptPreview(false)}
        />
      )}

      {mediaPreview && (
        <MediaModal
          title={`分鏡 #${mediaPreview.shot.shotNo} · ${data.project.title}`}
          shotId={mediaPreview.shot.id}
          version={mediaPreview.shot.updatedAt}
          hasClip={mediaPreview.shot.hasClip ?? (mediaPreview.shot.status === 'VIDEO' || mediaPreview.shot.status === 'READY')}
          initialTab={mediaPreview.tab}
          onClose={() => setMediaPreview(null)}
        />
      )}
    </div>
  );
}
