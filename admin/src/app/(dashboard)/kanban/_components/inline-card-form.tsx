'use client';

import { useState } from 'react';
import { PiPlusBold } from 'react-icons/pi';
import { useTranslation } from '@/hooks/use-translation';

interface InlineCardFormProps {
  onSubmit: (title: string, description?: string) => Promise<boolean>;
  disabled?: boolean;
}

export function InlineCardForm({ onSubmit, disabled }: InlineCardFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const ok = await onSubmit(trimmed, description.trim() || undefined);
    setSubmitting(false);
    if (ok) {
      setTitle('');
      setDescription('');
      setExpanded(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-gray-0 dark:bg-gray-100 p-3 shadow-sm"
    >
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder={t('admin.kanban.newCardPlaceholder')}
          maxLength={120}
          disabled={disabled || submitting}
          className="w-full rounded-md border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />

        {expanded && (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('admin.kanban.newCardDescriptionPlaceholder')}
            rows={2}
            maxLength={2000}
            disabled={disabled || submitting}
            className="w-full rounded-md border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
        )}

        <button
          type="submit"
          disabled={!title.trim() || disabled || submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:self-end"
        >
          {submitting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <PiPlusBold className="h-4 w-4" />
          )}
          {t('admin.kanban.addCard')}
        </button>
      </div>
    </form>
  );
}
