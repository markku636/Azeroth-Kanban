'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Badge, Button } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiImagesDuotone,
  PiUploadSimpleBold,
  PiTrashBold,
  PiDownloadSimpleBold,
  PiFilePdfDuotone,
  PiFileDuotone,
  PiMusicNotesDuotone,
  PiPlayCircleFill,
  PiXBold,
} from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { useConfirm } from '@/hooks/use-confirm';

interface MediaDto {
  id: string;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  size: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

type Tab = 'all' | 'image' | 'video' | 'audio' | 'file';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '圖片' },
  { key: 'video', label: '影片' },
  { key: 'audio', label: '音檔' },
  { key: 'file', label: '檔案' },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

/** 卡片縮圖：圖片直接顯示，影片用 <video> 首幀 + 播放疊層，音檔/檔案用圖示。 */
function Thumb({ m }: { m: MediaDto }) {
  if (m.kind === 'image') {
    return (
      <img
        src={m.url}
        alt={m.fileName}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  if (m.kind === 'video') {
    return (
      <>
        <video src={m.url} muted preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <PiPlayCircleFill className="h-10 w-10 text-white/85 drop-shadow" />
        </span>
      </>
    );
  }
  const Icon = m.kind === 'audio' ? PiMusicNotesDuotone : m.mimeType === 'application/pdf' ? PiFilePdfDuotone : PiFileDuotone;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400">
      <Icon className="h-12 w-12" />
      <span className="line-clamp-1 px-2 text-xs">{m.fileName}</span>
    </div>
  );
}

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<MediaDto | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/media');
      const json = await res.json();
      if (res.ok) setItems(json.data ?? []);
      else toast.error(json.message ?? '載入失敗');
    } catch {
      toast.error('載入失敗');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setUploading(true);
      let ok = 0;
      for (const f of list) {
        try {
          const fd = new FormData();
          fd.append('file', f);
          const res = await fetch('/api/v1/media/upload', { method: 'POST', body: fd });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.message ?? '上傳失敗');
          ok++;
        } catch (e) {
          toast.error(`${f.name}：${e instanceof Error ? e.message : '上傳失敗'}`);
        }
      }
      if (ok) toast.success(`已上傳 ${ok} 個檔案`);
      setUploading(false);
      await load();
    },
    [load],
  );

  const del = useCallback(
    async (m: MediaDto) => {
      const ok = await confirm({ title: '刪除檔案', message: `確定刪除「${m.fileName}」？此動作無法復原。`, type: 'danger' });
      if (!ok) return;
      try {
        const res = await fetch(`/api/v1/media/${m.id}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message ?? '刪除失敗');
        setItems((prev) => prev.filter((x) => x.id !== m.id));
        setPreview((p) => (p?.id === m.id ? null : p));
        toast.success('已刪除');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '刪除失敗');
      }
    },
    [confirm],
  );

  const filtered = useMemo(() => (tab === 'all' ? items : items.filter((i) => i.kind === tab)), [items, tab]);

  return (
    <div className="flex h-full w-full max-w-6xl flex-col px-2 py-2 sm:p-6">
      {/* 頁首 */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <PiImagesDuotone className="h-7 w-7 text-blue-600" />
            媒體庫
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            上傳並管理圖片、影片、音檔等素材
            {items.length > 0 && <span className="ms-1 text-gray-400">· 共 {items.length} 個檔案</span>}
          </p>
        </div>
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {uploading ? <Spinner className="me-1.5 h-4 w-4" /> : <PiUploadSimpleBold className="me-1.5 h-4 w-4" />}
          {uploading ? '上傳中…' : '上傳檔案'}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*,video/*,audio/*,application/pdf"
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* 拖放上傳區 */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
        className={`mb-5 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-7 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        <PiUploadSimpleBold className="h-6 w-6 text-gray-400" />
        <div className="text-sm text-gray-500">將檔案拖放到這裡，或點擊選擇（圖片 / 影片 / 音檔 / PDF，單檔 ≤ 100MB）</div>
      </div>

      {/* 種類篩選 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.key === 'all' ? items.length : items.filter((i) => i.kind === t.key).length;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-400'
              }`}
            >
              {t.label}
              {count > 0 && <span className={`ms-1 ${active ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* 網格 */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-200 dark:bg-gray-50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-gray-400">
          <PiImagesDuotone className="h-14 w-14 text-gray-300" />
          <div className="text-sm">還沒有媒體，點上方「上傳檔案」或拖放檔案上傳第一個吧。</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-gray-400">
          <PiImagesDuotone className="h-10 w-10 text-gray-300" />
          <div className="text-sm">這個分類目前沒有檔案。</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg dark:border-gray-200 dark:bg-gray-50"
            >
              <button
                type="button"
                onClick={() => setPreview(m)}
                aria-label={`預覽 ${m.fileName}`}
                className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-100"
              >
                <Thumb m={m} />
              </button>
              {/* 刪除鈕（hover 顯示） */}
              <button
                type="button"
                onClick={() => void del(m)}
                aria-label="刪除"
                className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/55 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
              >
                <PiTrashBold className="h-3.5 w-3.5" />
              </button>
              <div className="flex flex-col gap-1 p-2.5">
                <div className="line-clamp-1 text-sm font-medium text-gray-900" title={m.fileName}>
                  {m.fileName}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatBytes(m.size)}</span>
                  <span>{dayjs(m.createdAt).format('MM/DD HH:mm')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 預覽 Modal */}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} size="xl">
        {preview && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-4 dark:border-gray-200">
              <div className="min-w-0">
                <div className="truncate font-semibold text-gray-900" title={preview.fileName}>
                  {preview.fileName}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <Badge variant="flat" size="sm" color="secondary">
                    {preview.kind}
                  </Badge>
                  <span>{formatBytes(preview.size)}</span>
                  <span>{dayjs(preview.createdAt).format('YYYY/MM/DD HH:mm')}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="關閉"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <PiXBold className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-gray-100 p-4 dark:bg-gray-100">
              {preview.kind === 'image' && (
                <img src={preview.url} alt={preview.fileName} className="max-h-[65vh] w-auto max-w-full object-contain" />
              )}
              {preview.kind === 'video' && (
                <video src={preview.url} controls autoPlay className="max-h-[65vh] w-full" />
              )}
              {preview.kind === 'audio' && <audio src={preview.url} controls className="w-full" />}
              {preview.kind === 'file' &&
                (preview.mimeType === 'application/pdf' ? (
                  <iframe src={preview.url} title={preview.fileName} className="h-[65vh] w-full rounded bg-white" />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                    <PiFileDuotone className="h-16 w-16" />
                    <span className="text-sm">此檔案無法預覽，請下載後開啟。</span>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-4 dark:border-gray-200">
              <a
                href={`/api/v1/media/${preview.id}/download`}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                <PiDownloadSimpleBold className="h-4 w-4" /> 下載
              </a>
              <Button color="danger" onClick={() => void del(preview)}>
                <PiTrashBold className="me-1.5 h-4 w-4" /> 刪除
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
