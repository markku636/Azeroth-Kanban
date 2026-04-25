'use client';

import { useState, type KeyboardEvent } from 'react';

interface PromptDialogBodyProps {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * 原生 `prompt()` 的 Modal 版本 body，供 `usePrompt()` hook 使用。
 * 按 Enter 確認、按 Esc 取消（由外層 Modal 處理）
 */
export function PromptDialogBody({
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmLabel = '確認',
  cancelLabel = '取消',
  required = false,
  onConfirm,
  onCancel,
}: PromptDialogBodyProps) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(false);

  const canSubmit = !required || value.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    setLoading(true);
    onConfirm(value.trim());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit) submit();
  };

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {message && (
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      )}
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="mt-4 block w-full rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-0 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          onClick={submit}
          disabled={loading || !canSubmit}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? '處理中...' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
