'use client';

import { type ReactElement, useState } from 'react';
import { cn } from '@/utils/class-names';

export type ConfirmDialogType = 'info' | 'warning' | 'danger' | 'success';

interface ConfirmDialogBodyProps {
  title: string;
  message: string;
  type?: ConfirmDialogType;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const typeConfig: Record<
  ConfirmDialogType,
  { icon: ReactElement; iconBg: string; confirmBtnClass: string }
> = {
  info: {
    icon: (
      <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
    confirmBtnClass: 'bg-blue-600 hover:bg-blue-700',
  },
  warning: {
    icon: (
      <svg className="h-6 w-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
    confirmBtnClass: 'bg-amber-600 hover:bg-amber-700',
  },
  danger: {
    icon: (
      <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    iconBg: 'bg-red-100 dark:bg-red-900/50',
    confirmBtnClass: 'bg-red-600 hover:bg-red-700',
  },
  success: {
    icon: (
      <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    iconBg: 'bg-green-100 dark:bg-green-900/50',
    confirmBtnClass: 'bg-green-600 hover:bg-green-700',
  },
};

/**
 * ConfirmDialog 的 body 版本（不帶 Modal 外殼），供 `useConfirm()` hook 塞進全域 Modal 使用。
 */
export function ConfirmDialogBody({
  title,
  message,
  type = 'info',
  confirmLabel = '確認',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogBodyProps) {
  const [loading, setLoading] = useState(false);
  const config = typeConfig[type];

  const handleConfirm = () => {
    setLoading(true);
    onConfirm();
  };

  return (
    <div className="p-6">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
            config.iconBg
          )}
        >
          {config.icon}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{message}</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className={cn(
            'px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors',
            config.confirmBtnClass
          )}
        >
          {loading ? '處理中...' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
