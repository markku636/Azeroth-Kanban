'use client';

import { useEffect, useState } from 'react';
import type { CardStatus } from '@prisma/client';
import { useTranslation } from '@/hooks/use-translation';
import { CARD_STATUS_CONFIG, CARD_STATUS_ORDER } from '../_lib/card-status';
import type { CardDto } from '../_lib/use-kanban-board';

interface EditCardModalProps {
  card: CardDto | null;
  onClose: () => void;
  onSubmit: (
    id: string,
    patch: { title: string; description: string | null; status: CardStatus }
  ) => Promise<boolean>;
}

export function EditCardModal({ card, onClose, onSubmit }: EditCardModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CardStatus>('TODO');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? '');
      setStatus(card.status);
    }
  }, [card]);

  if (!card) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const ok = await onSubmit(card.id, {
      title: title.trim(),
      description: description.trim() || null,
      status,
    });
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-gray-800 sm:max-w-lg sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
          {t('admin.kanban.editCardTitle')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="kanban-card-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.kanban.cardTitle')} <span className="text-red-500">*</span>
            </label>
            <input
              id="kanban-card-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="kanban-card-description" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.kanban.cardDescription')}
            </label>
            <textarea
              id="kanban-card-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="kanban-card-status" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.kanban.cardStatus')}
            </label>
            <select
              id="kanban-card-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CardStatus)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            >
              {CARD_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {CARD_STATUS_CONFIG[s].emoji} {t(CARD_STATUS_CONFIG[s].labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {t('admin.kanban.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
