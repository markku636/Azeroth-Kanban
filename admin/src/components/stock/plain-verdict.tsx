import type { ReactNode } from 'react';
import { cn } from '@/utils/class-names';
import type { VerdictTone } from '@/lib/beginner-verdict';

interface PlainVerdictProps {
  /** 語意傾向：good＝偏正向 / neutral＝中性 / bad＝偏負向 */
  tone: VerdictTone;
  children: ReactNode;
  className?: string;
}

/** 顏色採台股慣例（good＝紅、bad＝綠）；emoji 用 👍 / 👀 / 👎 避免顏色混淆。 */
const TONE_CLASS: Record<VerdictTone, string> = {
  good: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300',
  neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  bad: 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-300',
};

const TONE_EMOJI: Record<VerdictTone, string> = {
  good: '👍',
  neutral: '👀',
  bad: '👎',
};

/**
 * 白話結論一句話的彩色小標籤。
 * 用法：`<PlainVerdict tone={v.tone}>{v.text}</PlainVerdict>`（v 來自 beginner-verdict.ts）。
 */
export function PlainVerdict({ tone, children, className }: PlainVerdictProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[tone],
        className,
      )}
    >
      <span aria-hidden>{TONE_EMOJI[tone]}</span>
      {children}
    </span>
  );
}
