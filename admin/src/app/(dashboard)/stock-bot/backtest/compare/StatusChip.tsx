'use client';

/** 子回測 / 批次狀態晶片。 */
const STATUS_MAP: Record<string, { text: string; cls: string }> = {
  pending: { text: '排隊中', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  running: {
    text: '運算中',
    cls: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
  },
  done: {
    text: '完成',
    cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  partial: {
    text: '部分完成',
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  failed: { text: '失敗', cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' },
};

export function StatusChip({ status }: { status: string }) {
  const m = STATUS_MAP[status] ?? STATUS_MAP.pending;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${m.cls}`} aria-label={m.text}>
      {m.text}
    </span>
  );
}
