import { DATA_SOURCES, DataSourceKey } from '@/config/data-sources';
import { cn } from '@/utils/class-names';

interface DataSourceTagProps {
  /** 數據來源分類。 */
  source: DataSourceKey;
  /** 資料日期（YYYY-MM-DD / YYYY-MM 等）；為空則僅顯示來源、不顯示日期。 */
  date?: string | null;
  /** 日期前綴文字，預設「資料日期」；月營收等可傳「資料月份」。 */
  dateLabel?: string;
  className?: string;
}

/**
 * 數據區塊下緣的「資料來源 + 日期」純文字標籤（低調灰字）。
 * 來源文字統一由 `data-sources.ts` 中央登錄提供，避免散落各頁。
 */
export function DataSourceTag({
  source,
  date,
  dateLabel = '資料日期',
  className,
}: DataSourceTagProps) {
  const meta = DATA_SOURCES[source];
  return (
    <p className={cn('mt-1 text-xs text-gray-400', className)}>
      資料來源：{meta.label}
      {meta.baseNote ? `（${meta.baseNote}）` : ''}
      {date ? ` ｜ ${dateLabel}：${date}` : ''}
    </p>
  );
}
