'use client';

import { useState } from 'react';
import { PiXBold, PiDownloadSimpleBold, PiWarningCircleBold, PiImageSquareBold, PiVideoFill } from 'react-icons/pi';
import { Modal } from '@/components/modal';

/**
 * 單鏡媒體燈箱：點看板卡縮圖跳窗顯示「大圖」，若已生成影片可在頂部切換「關鍵圖 / 影片」。
 * 圖走 keyframe 路由、影片走 Range-enabled clip 路由；各自附下載鈕。
 */
export function MediaModal({
  title,
  shotId,
  version,
  hasClip,
  initialTab = 'image',
  onClose,
}: {
  title: string;
  shotId: string;
  version?: string;
  hasClip?: boolean;
  initialTab?: 'image' | 'video';
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'image' | 'video'>(hasClip ? initialTab : 'image');
  const [imgErr, setImgErr] = useState(false);
  const [vidErr, setVidErr] = useState(false);
  const v = version ? `?v=${encodeURIComponent(version)}` : '';
  const imageSrc = `/api/v1/studio/shots/${shotId}/keyframe${v}`;
  const videoSrc = `/api/v1/studio/shots/${shotId}/clip${v}`;
  const activeSrc = tab === 'video' ? videoSrc : imageSrc;
  const downloadName = `${title.replace(/[\\/:*?"<>|]/g, '_')}.${tab === 'video' ? 'mp4' : 'png'}`;
  const err = tab === 'video' ? vidErr : imgErr;

  const tabBtn = (key: 'image' | 'video', icon: React.ReactNode, text: string, disabled?: boolean) => {
    const isActive = tab === key;
    const tone = key === 'video' ? 'emerald' : 'sky';
    return (
      <button
        type="button"
        disabled={disabled}
        aria-pressed={isActive}
        onClick={() => setTab(key)}
        className={
          isActive
            ? `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white ${tone === 'emerald' ? 'bg-emerald-600' : 'bg-sky-600'}`
            : `flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${tone === 'emerald' ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300' : 'border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300'}`
        }
        title={disabled ? '尚未生成影片' : text}
      >
        {icon} {text}
      </button>
    );
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-center gap-3">
            <span className="min-w-0 truncate font-semibold text-gray-900">{title}</span>
            <span className="flex flex-none items-center gap-1.5">
              {tabBtn('image', <PiImageSquareBold className="h-4 w-4" />, '關鍵圖')}
              {tabBtn('video', <PiVideoFill className="h-4 w-4" />, '影片', !hasClip)}
            </span>
          </div>
          <div className="flex flex-none items-center gap-4">
            {!err && (
              <a
                href={activeSrc}
                download={downloadName}
                className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary"
                title={tab === 'video' ? '下載影片' : '下載關鍵圖'}
              >
                <PiDownloadSimpleBold className="h-4 w-4" /> 下載
              </a>
            )}
            <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 transition-colors hover:text-gray-600">
              <PiXBold className="h-4 w-4" />
            </button>
          </div>
        </div>
        {err ? (
          <div className="flex flex-col items-center justify-center gap-2 bg-gray-50 px-6 py-16 text-center text-sm text-gray-500">
            <PiWarningCircleBold className="h-8 w-8 text-gray-300" />
            {tab === 'video' ? '影片暫時無法播放，可能尚未生成或檔案已被覆蓋。' : '關鍵圖暫時無法顯示，可能尚未生成。'}
          </div>
        ) : (
          <div className="flex items-center justify-center bg-black">
            {tab === 'video' ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={videoSrc} controls autoPlay playsInline onError={() => setVidErr(true)} className="max-h-[78vh] w-auto max-w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageSrc} alt={title} onError={() => setImgErr(true)} className="max-h-[78vh] w-auto max-w-full object-contain" />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
