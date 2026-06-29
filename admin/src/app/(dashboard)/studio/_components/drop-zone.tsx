'use client';

import { useRef, useState, type ReactNode } from 'react';
import { PiUploadSimpleBold } from 'react-icons/pi';

/** 可重用的拖放上傳區（也可點擊選檔）。把選到的檔案交給 onFiles。 */
export function DropZone({
  onFiles,
  accept = 'image/png,image/jpeg,image/webp',
  multiple = false,
  disabled = false,
  hint,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const handle = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) handle(e.dataTransfer.files); }}
      className={
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ' +
        (disabled
          ? 'cursor-not-allowed border-gray-200 opacity-50'
          : over
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
            : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-100')
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => { handle(e.target.files); e.currentTarget.value = ''; }}
      />
      <PiUploadSimpleBold className="h-5 w-5 text-gray-400" />
      <div className="text-sm text-gray-600 dark:text-gray-400">拖放圖片到此，或點擊選檔</div>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
