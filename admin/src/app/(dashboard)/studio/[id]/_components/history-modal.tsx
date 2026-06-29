'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PiXBold, PiImageSquareBold, PiFilmReelBold, PiPlayFill, PiClockCounterClockwiseBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { VideoModal } from '../../_components/video-modal';

interface VersionDto { id: string; stage: string; createdAt: string }

/**
 * 「查看歷史」：列出某分鏡每次生成留下的關鍵幀圖與影片版本（新到舊），
 * 點圖放大、點影片播放。版本檔由後端 /versions/[id]/file 串出。
 */
export function HistoryModal({ shotId, shotNo, onClose }: { shotId: string; shotNo: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<VersionDto[]>([]);
  const [playing, setPlaying] = useState<VersionDto | null>(null);
  const [zoom, setZoom] = useState<VersionDto | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/v1/studio/shots/${shotId}/versions`);
        const json = await res.json();
        if (res.ok && json.data) setVersions(json.data.versions ?? []);
        else toast.error(json.message ?? '載入歷史失敗');
      } catch {
        toast.error('載入歷史失敗');
      }
      setLoading(false);
    })();
  }, [shotId]);

  const fileUrl = (v: VersionDto) => `/api/v1/studio/versions/${v.id}/file`;
  const images = versions.filter((v) => v.stage === 'keyframe');
  const videos = versions.filter((v) => v.stage === 'video');
  const fmt = (iso: string) => new Date(iso).toLocaleString('zh-TW', { hour12: false });

  return (
    <>
      <Modal isOpen onClose={onClose} size="xl">
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              <PiClockCounterClockwiseBold className="h-5 w-5 text-blue-500" /> 分鏡 #{shotNo} 生成歷史
            </h3>
            <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 hover:text-gray-600">
              <PiXBold className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-r-transparent" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
              <PiClockCounterClockwiseBold className="h-9 w-9 text-gray-300" />
              尚無生成歷史。每次「生圖 / 生片」都會在這裡留下一個版本。
            </div>
          ) : (
            <div className="space-y-5">
              {images.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <PiImageSquareBold className="h-4 w-4 text-sky-500" /> 圖片版本（{images.length}）
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {images.map((v, i) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setZoom(v)}
                        className="group relative overflow-hidden rounded border border-gray-200 dark:border-gray-300"
                        title={`點擊放大 · ${fmt(v.createdAt)}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileUrl(v)} alt={`版本 ${fmt(v.createdAt)}`} className="aspect-video w-full object-cover transition-transform group-hover:scale-105" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[10px] text-white">
                          {i === 0 ? '最新 · ' : ''}{fmt(v.createdAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {videos.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <PiFilmReelBold className="h-4 w-4 text-emerald-500" /> 影片版本（{videos.length}）
                  </div>
                  <div className="space-y-1.5">
                    {videos.map((v, i) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setPlaying(v)}
                        className="flex w-full items-center gap-2 rounded border border-gray-200 px-2.5 py-2 text-left text-sm transition-colors hover:bg-emerald-50 dark:border-gray-300 dark:hover:bg-emerald-950/30"
                      >
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-600 text-white">
                          <PiPlayFill className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">{fmt(v.createdAt)}</span>
                        {i === 0 && <span className="ms-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">最新</span>}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 圖片放大 lightbox */}
      {zoom && (
        <button
          type="button"
          aria-label="關閉放大檢視"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-black/85 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(zoom)} alt={`版本 ${fmt(zoom.createdAt)}`} className="max-h-[80vh] max-w-full rounded object-contain" />
          <span className="text-xs text-white/80">{fmt(zoom.createdAt)} · 點任意處關閉</span>
        </button>
      )}

      {playing && (
        <VideoModal
          title={`分鏡 #${shotNo} 影片版本 · ${fmt(playing.createdAt)}`}
          src={fileUrl(playing)}
          downloadName={`shot${shotNo}_${playing.id}.mp4`}
          onClose={() => setPlaying(null)}
        />
      )}
    </>
  );
}
