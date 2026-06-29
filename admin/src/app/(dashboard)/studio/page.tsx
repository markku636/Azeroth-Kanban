'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Badge, Button, Input } from 'rizzui';
import toast from 'react-hot-toast';
import { PiFilmReelDuotone, PiPlusBold, PiCpuDuotone, PiPlayFill, PiCheckCircleFill, PiMagnifyingGlassBold, PiUsersThreeDuotone } from 'react-icons/pi';
import { VideoModal } from './_components/video-modal';

interface ProjectDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  aspect: string;
  fps: number;
  hasOutput: boolean;
  outputUpdatedAt: string | null;
  shotCount?: number;
}

type BadgeColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'danger';
// 專案階段（schema：interview|script|storyboard|audio|export）→ 中文 + 顏色
const STATUS_META: Record<string, { color: BadgeColor; label: string }> = {
  interview: { color: 'secondary', label: '訪談中' },
  script: { color: 'info', label: '腳本' },
  storyboard: { color: 'info', label: '分鏡' },
  audio: { color: 'primary', label: '配音' },
  export: { color: 'success', label: '已完成' },
};

export default function StudioProjectsPage() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [newAspect, setNewAspect] = useState('9:16');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<{ id: string; title: string; v: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/studio/projects');
      const json = await res.json();
      if (res.ok) setProjects(json.data ?? []);
      else toast.error(json.message ?? '載入失敗');
    } catch {
      toast.error('載入失敗');
    }
    setLoading(false);
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
        await load();
      } else {
        toast.error(json.message ?? '建立失敗');
      }
    } catch {
      toast.error('建立失敗');
    }
    setCreating(false);
  };

  const finished = projects.filter((p) => p.hasOutput).length;
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(kw) || (p.description ?? '').toLowerCase().includes(kw));
  }, [projects, q]);

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
          onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
        />
        <select
          aria-label="畫幅比例"
          value={newAspect}
          onChange={(e) => setNewAspect(e.target.value)}
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-gray-400">
          <PiFilmReelDuotone className="h-14 w-14 text-gray-300" />
          <div className="text-sm">還沒有專案，在上方輸入名稱建立第一個吧。</div>
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
                <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
                  <div className="line-clamp-2 font-semibold leading-snug text-gray-900 transition-colors group-hover:text-blue-600">{p.title}</div>
                  <Badge color={meta.color} variant="flat" size="sm" className="flex-none">{meta.label}</Badge>
                </div>
                <div className="pointer-events-none relative z-10 mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">{p.aspect}</span>
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">{p.fps}fps</span>
                  {p.shotCount != null && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-100">{p.shotCount} 個分鏡</span>}
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
                    <span className="text-xs text-gray-300">尚無成片</span>
                  )}
                  {p.hasOutput && (
                    <button
                      type="button"
                      onClick={() => setPreview({ id: p.id, title: p.title, v: p.outputUpdatedAt ?? '' })}
                      className="pointer-events-auto flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                    >
                      <PiPlayFill className="h-3 w-3" /> 預覽
                    </button>
                  )}
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
