import type { CardStatus } from '@prisma/client';

/**
 * 卡片狀態 UI 設定（emoji / 顯示色 / i18n key）
 */
export const CARD_STATUS_CONFIG = {
  TODO:        { labelKey: 'admin.kanban.statusTodo',       emoji: '☐',  color: 'gray',  bg: 'bg-gray-50  dark:bg-gray-800/50',  border: 'border-gray-200  dark:border-gray-700' },
  IN_PROGRESS: { labelKey: 'admin.kanban.statusInProgress', emoji: '▶',  color: 'blue',  bg: 'bg-blue-50  dark:bg-blue-900/20',  border: 'border-blue-200  dark:border-blue-800' },
  IN_REVIEW:   { labelKey: 'admin.kanban.statusInReview',   emoji: '👁', color: 'amber', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
  DONE:        { labelKey: 'admin.kanban.statusDone',       emoji: '✅', color: 'green', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800' },
} as const satisfies Record<CardStatus, {
  labelKey: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
}>;

export const CARD_STATUS_ORDER: readonly CardStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
] as const;
