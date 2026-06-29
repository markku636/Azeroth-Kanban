'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PiXBold, PiCopyBold, PiArrowsClockwiseBold, PiYoutubeLogoFill, PiWarningCircleBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';

interface YouTubeMeta {
  title: string;
  thumbnailText: string;
  description: string;
  hashtags: string[];
  pinnedComment: string;
}

/**
 * 「YouTube 上架文案」：成片完成後一鍵產生會被點開的標題 / 縮圖大字 / 說明 / hashtags /
 * 置頂留言，每欄可一鍵複製，方便直接貼到 YouTube / 抖音。不落庫（每次重新生成）。
 */
export function YouTubeMetaModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [meta, setMeta] = useState<YouTubeMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/youtube-meta`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.code !== 0) throw new Error(json.message ?? '產生失敗');
      setMeta(json.data?.meta ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '產生失敗');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void generate();
  }, [generate]);

  const copy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => toast.success(`已複製${label}`),
      () => toast.error('複製失敗'),
    );
  };

  const copyAll = () => {
    if (!meta) return;
    const block = [meta.title, '', meta.description, '', meta.hashtags.join(' ')].join('\n').trim();
    copy(block, '完整上架文案');
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-900">
            <PiYoutubeLogoFill className="h-5 w-5 flex-none text-red-600" />
            <span className="truncate">YouTube 上架文案</span>
          </div>
          <div className="flex flex-none items-center gap-3">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary disabled:opacity-40"
              title="換一批文案"
            >
              <PiArrowsClockwiseBold className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? '生成中…' : '重新生成'}
            </button>
            <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 transition-colors hover:text-gray-600">
              <PiXBold className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !meta && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-gray-500">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-red-500" />
              AI 正在撰寫吸睛標題與說明…
            </div>
          )}
          {err && !loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-sm text-gray-500">
              <PiWarningCircleBold className="h-8 w-8 text-gray-300" />
              {err}
              <button type="button" onClick={() => void generate()} className="mt-1 text-primary hover:underline">
                再試一次
              </button>
            </div>
          )}
          {meta && (
            <div className="flex flex-col gap-4">
              <Field label="標題" hint="貼到 YouTube 標題列；前段就有鉤子" value={meta.title} onCopy={() => copy(meta.title, '標題')} big />
              <Field label="縮圖大字" hint="放在封面圖上的超大字" value={meta.thumbnailText} onCopy={() => copy(meta.thumbnailText, '縮圖大字')} />
              <Field label="影片說明" hint="第 1 行是最強鉤子" value={meta.description} onCopy={() => copy(meta.description, '說明')} multiline />
              {meta.hashtags.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-300">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Hashtags</span>
                    <button type="button" onClick={() => copy(meta.hashtags.join(' '), 'hashtags')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary">
                      <PiCopyBold className="h-3.5 w-3.5" /> 複製
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.hashtags.map((t) => (
                      <span key={t} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <Field label="置頂留言" hint="引導觀眾留言／分享，提高互動" value={meta.pinnedComment} onCopy={() => copy(meta.pinnedComment, '置頂留言')} multiline />
            </div>
          )}
        </div>

        {meta && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-300">
            <button
              type="button"
              onClick={copyAll}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <PiCopyBold className="h-4 w-4" /> 複製完整上架文案
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  value,
  onCopy,
  multiline,
  big,
}: {
  label: string;
  hint?: string;
  value: string;
  onCopy: () => void;
  multiline?: boolean;
  big?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-300">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500">
          {label}
          {hint ? <span className="ml-1.5 font-normal text-gray-400">· {hint}</span> : null}
        </span>
        <button type="button" onClick={onCopy} className="flex flex-none items-center gap-1 text-xs text-gray-400 hover:text-primary">
          <PiCopyBold className="h-3.5 w-3.5" /> 複製
        </button>
      </div>
      <p className={`whitespace-pre-wrap break-words text-gray-900 ${big ? 'text-base font-semibold' : 'text-sm'} ${multiline ? '' : ''}`}>{value}</p>
    </div>
  );
}
