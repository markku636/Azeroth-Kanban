'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { Badge, Button, Input } from 'rizzui';
import toast from 'react-hot-toast';
import { PiFilmReelDuotone, PiPlusBold, PiCpuDuotone, PiPlayFill, PiCheckCircleFill, PiMagnifyingGlassBold, PiUsersThreeDuotone, PiTrashBold, PiCopySimpleBold } from 'react-icons/pi';
import { useConfirm } from '@/hooks/use-confirm';
import { VideoModal } from './_components/video-modal';

interface ProjectDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  aspect: string;
  fps: number;
  renderQuality?: string | null;
  hasOutput: boolean;
  outputUpdatedAt: string | null;
  shotCount?: number;
  keyframedCount?: number;
  coverShotId?: string;
  coverUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type SortKey = 'updated' | 'created' | 'title';

type BadgeColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'danger';
// 專案階段（schema：interview|script|storyboard|audio|export）→ 中文 + 顏色
const STATUS_META: Record<string, { color: BadgeColor; label: string }> = {
  interview: { color: 'secondary', label: '訪談中' },
  script: { color: 'info', label: '腳本' },
  storyboard: { color: 'info', label: '分鏡' },
  audio: { color: 'primary', label: '配音' },
  export: { color: 'success', label: '已完成' },
};

// 空狀態的「起手式片名」：高概念、好笑、適合短影音，破解空白頁焦慮。點一下填入片名輸入框。
const STARTER_TITLES = [
  '中年阿智：最後一次挑戰道館',
  '上班族倉鼠逃出辦公室',
  '立志當網紅的厭世家貓',
  '外送員其實是退休武林高手',
];

export default function StudioProjectsPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [newAspect, setNewAspect] = useState('9:16');
  useEffect(() => { const a = localStorage.getItem('studio:newAspect'); if (a === '9:16' || a === '16:9' || a === '1:1') setNewAspect(a); }, []);
  const changeAspect = (a: string) => { setNewAspect(a); try { localStorage.setItem('studio:newAspect', a); } catch { /* 隱私模式 */ } };
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  // 記住使用者的排序偏好（在 effect 內讀 localStorage，避免 SSR hydration 不一致）。
  useEffect(() => {
    const s = localStorage.getItem('studio:sort');
    if (s === 'updated' || s === 'created' || s === 'title') setSort(s);
  }, []);
  const changeSort = (s: SortKey) => { setSort(s); try { localStorage.setItem('studio:sort', s); } catch { /* 隱私模式可能擋 localStorage */ } };
  const [preview, setPreview] = useState<{ id: string; title: string; v: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dupingId, setDupingId] = useState<string | null>(null);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++loadSeq.current;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/studio/projects');
      const json = await res.json();
      if (mine !== loadSeq.current) return; // 較新的 load 已發出 → 丟棄舊回應
      if (res.ok) setProjects(json.data ?? []);
      else toast.error(json.message ?? '載入失敗');
    } catch {
      if (mine === loadSeq.current) toast.error('載入失敗');
    }
    if (mine === loadSeq.current) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v1/studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), aspect: newAspect }),
      });
      const json = await res.json();
      if (res.ok) {
        setTitle('');
        toast.success('專案已建立');
        // 直接進入新專案，馬上能用 AI 訪談／直接生成（建立後最常見的下一步）。
        const id = json.data?.id as string | undefined;
        if (id) { setCreating(false); router.push(`/studio/${id}`); return; }
        await load();
      } else {
        toast.error(json.message ?? '建立失敗');
      }
    } catch {
      toast.error('建立失敗');
    }
    setCreating(false);
  };

  // 刪除專案：不可復原（連帶刪除分鏡／已生成的圖片與影片成品）。以明確危險確認把關。
  const remove = async (p: ProjectDto) => {
    const ok = await confirm({
      title: '刪除專案',
      message: `確定刪除「${p.title}」？此操作無法復原，會一併刪除所有分鏡、已生成的圖片與影片成品。`,
      type: 'danger',
      confirmLabel: '永久刪除',
    });
    if (!ok) return;
    setDeletingId(p.id);
    // 樂觀移除：先從列表拿掉，失敗再還原。
    const snapshot = projects;
    setProjects((list) => list.filter((x) => x.id !== p.id));
    try {
      const res = await fetch(`/api/v1/studio/projects/${p.id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '刪除失敗'); }
      toast.success('專案已刪除');
    } catch (e) {
      setProjects(snapshot);
      toast.error(e instanceof Error ? e.message : '刪除失敗');
    }
    setDeletingId(null);
  };

  // 複製專案：建立同劇本的乾淨副本（不含已生成的圖／片），方便做變體。
  const duplicate = async (p: ProjectDto) => {
    setDupingId(p.id);
    try {
      const res = await fetch(`/api/v1/studio/projects/${p.id}/duplicate`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? '複製失敗');
      toast.success('已建立副本（劇本已複製，請重新生成圖片與影片）');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '複製失敗');
    }
    setDupingId(null);
  };

  const finished = projects.filter((p) => p.hasOutput).length;
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const base = kw
      ? projects.filter((p) => p.title.toLowerCase().includes(kw) || (p.description ?? '').toLowerCase().includes(kw))
      : projects;
    const arr = [...base];
    if (sort === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
    else {
      const key = sort === 'updated' ? 'updatedAt' : 'createdAt';
      arr.sort((a, b) => String(b[key] ?? '').localeCompare(String(a[key] ?? ''))); // ISO 字串遞減＝新到舊
    }
    return arr;
  }, [projects, q, sort]);

  return (
    <div className="flex h-full w-full max-w-6xl flex-col px-2 py-2 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <PiFilmReelDuotone className="h-7 w-7 text-blue-600" />
            Studio 影片工作室
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            用一句故事點子，AI 幫你切分鏡、配音、生成短片
            {projects.length > 0 && <span className="ms-1 text-gray-400">· 共 {projects.length} 個專案，{finished} 部已完成</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(projects.length > 4 || q) && (
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋專案…"
              prefix={<PiMagnifyingGlassBold className="h-4 w-4 text-gray-400" />}
              clearable
              onClear={() => setQ('')}
              className="w-44 sm:w-56"
            />
          )}
          {projects.length > 1 && (
            <select
              aria-label="排序方式"
              value={sort}
              onChange={(e) => changeSort(e.target.value as SortKey)}
              title="專案排序方式"
              className="flex-none rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50"
            >
              <option value="updated">最近更新</option>
              <option value="created">最新建立</option>
              <option value="title">名稱</option>
            </select>
          )}
          <Link href="/studio/characters">
            <Button variant="outline" size="sm">
              <PiUsersThreeDuotone className="me-1.5 h-4 w-4" /> 角色庫
            </Button>
          </Link>
          <Link href="/studio/queue">
            <Button variant="outline" size="sm">
              <PiCpuDuotone className="me-1.5 h-4 w-4" /> GPU 佇列
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-5 flex gap-2">
        <Input
          className="flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="新專案名稱…"
          maxLength={120}
          onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
        />
        <select
          aria-label="畫幅比例"
          value={newAspect}
          onChange={(e) => changeAspect(e.target.value)}
          title="新專案的畫幅（可在專案內再改）"
          className="flex-none rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700 dark:bg-gray-50"
        >
          <option value="9:16">9:16 直式</option>
          <option value="16:9">16:9 橫式</option>
          <option value="1:1">1:1 方形</option>
        </select>
        <Button onClick={() => void create()} isLoading={creating} disabled={creating || !title.trim()}>
          <PiPlusBold className="me-1.5 h-4 w-4" /> 新增專案
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-200 dark:bg-gray-50">
              <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-300" />
              <div className="mt-3 h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-200" />
              <div className="mt-3 h-3 w-full rounded bg-gray-100 dark:bg-gray-200" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-gray-400">
          <PiFilmReelDuotone className="h-14 w-14 text-gray-300" />
          <div className="text-sm text-gray-500">還沒有專案。先取個片名建立專案，建立後用「✨ AI 訪談」一句話就能生成分鏡。</div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-xs text-gray-400">沒靈感？點一個試試（會填入上方片名）：</div>
            <div className="flex max-w-xl flex-wrap justify-center gap-1.5">
              {STARTER_TITLES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTitle(t)}
                  className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs text-purple-700 transition-colors hover:border-purple-300 hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-300"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-gray-400">
          <PiMagnifyingGlassBold className="h-10 w-10 text-gray-300" />
          <div className="text-sm">找不到符合「{q}」的專案。</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const meta = STATUS_META[p.status] ?? { color: 'secondary' as BadgeColor, label: p.status };
            return (
              <div
                key={p.id}
                className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg dark:border-gray-200 dark:bg-gray-50"
              >
                {/* 整卡可點 = 鋪滿的 stretched link（在最底層），預覽鈕為其上的獨立可點元素，避免 button 巢狀在 anchor 內 */}
                <Link href={`/studio/${p.id}`} aria-label={`開啟專案 ${p.title}`} className="absolute inset-0 z-0 rounded-lg" />
                {p.hasOutput ? (
                  <div className="pointer-events-none relative z-10 mb-3 flex h-40 items-center justify-center overflow-hidden rounded-lg bg-black">
                    {/* 用成片在 0.5s 的畫面當海報（媒體片段 #t=0.5，preload=metadata），無需後端改動。直式片＝手機比例 letterbox。 */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={`/api/v1/studio/projects/${p.id}/output${p.outputUpdatedAt ? `?v=${encodeURIComponent(p.outputUpdatedAt)}` : ''}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className="h-full w-auto max-w-full object-contain"
                    />
                  </div>
                ) : p.coverShotId ? (
                  <div className="pointer-events-none relative z-10 mb-3 flex h-40 items-center justify-center overflow-hidden rounded-lg bg-black">
                    {/* 尚無成片但已有關鍵幀 → 用首張關鍵幀當封面，讓進行中的專案也認得出來 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/v1/studio/shots/${p.coverShotId}/keyframe${p.coverUpdatedAt ? `?v=${encodeURIComponent(p.coverUpdatedAt)}` : ''}`}
                      alt={`${p.title} 關鍵幀`}
                      className="h-full w-auto max-w-full object-contain opacity-90"
                    />
                  </div>
                ) : null}
                <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
                  <div className="line-clamp-2 font-semibold leading-snug text-gray-900 transition-colors group-hover:text-blue-600">{p.title}</div>
                  <Badge color={meta.color} variant="flat" size="sm" className="flex-none">{meta.label}</Badge>
                </div>
                <div className="pointer-events-none relative z-10 mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">{p.aspect}</span>
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">{p.fps}fps</span>
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">{p.renderQuality === 'standard' ? '720p' : '1080p'}</span>
                  {p.shotCount != null && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">{p.shotCount} 個分鏡</span>}
                  {p.shotCount != null && p.shotCount > 0 && p.keyframedCount != null && (
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">
                      {p.keyframedCount >= p.shotCount ? '✓ 已生圖' : `已生圖 ${p.keyframedCount}/${p.shotCount}`}
                    </span>
                  )}
                </div>
                {p.description && <div className="pointer-events-none relative z-10 mt-2 line-clamp-2 text-sm text-gray-600">{p.description}</div>}
                {/* 撐高，讓底部分隔線在各卡片對齊到最底 */}
                <div className="flex-1" />
                <div className="pointer-events-none relative z-10 mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-gray-200">
                  {p.hasOutput ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <PiCheckCircleFill className="h-3.5 w-3.5" />
                      成片 {p.outputUpdatedAt ? dayjs(p.outputUpdatedAt).format('MM/DD HH:mm') : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">{p.updatedAt ? `更新於 ${dayjs(p.updatedAt).format('MM/DD HH:mm')}` : '尚無成片'}</span>
                  )}
                  <div className="pointer-events-auto flex items-center gap-1">
                    {p.hasOutput && (
                      <button
                        type="button"
                        onClick={() => setPreview({ id: p.id, title: p.title, v: p.outputUpdatedAt ?? '' })}
                        className="flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                      >
                        <PiPlayFill className="h-3 w-3" /> 預覽
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void duplicate(p)}
                      disabled={dupingId === p.id}
                      aria-label={`複製專案 ${p.title}`}
                      title="複製為新副本（同劇本，不含已生成的圖／片）"
                      className="flex items-center justify-center rounded-md border border-transparent p-1 text-gray-300 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 dark:hover:border-blue-900 dark:hover:bg-blue-950/30 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <PiCopySimpleBold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(p)}
                      disabled={deletingId === p.id}
                      aria-label={`刪除專案 ${p.title}`}
                      title="刪除專案（無法復原）"
                      className="flex items-center justify-center rounded-md border border-transparent p-1 text-gray-300 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:border-red-900 dark:hover:bg-red-950/30 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <PiTrashBold className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <VideoModal
          title={`成片預覽 · ${preview.title}`}
          src={`/api/v1/studio/projects/${preview.id}/output${preview.v ? `?v=${encodeURIComponent(preview.v)}` : ''}`}
          downloadName={`${preview.title}.mp4`}
          exportProjectId={preview.id}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
