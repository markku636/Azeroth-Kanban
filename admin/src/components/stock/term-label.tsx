import { GLOSSARY, type GlossaryKey } from '@/config/financial-glossary';
import { InfoTooltip } from '@/components/stock/info-tooltip';

interface TermLabelProps {
  /** 名詞字典的 key，決定顯示文字與浮窗內容 */
  termKey: GlossaryKey;
  /** 覆寫顯示文字（預設用字典的 term，例如表頭想顯示「營收YoY」而非「營收 YoY」） */
  text?: string;
  className?: string;
}

/**
 * 名詞 + ⓘ 說明浮窗：浮窗內容（白話一句話 + 範例）統一由 `financial-glossary.ts` 提供。
 * 用法：`<TermLabel termKey="PER" />` 或 `<TermLabel termKey="PER" text="本益比(倍)" />`。
 */
export function TermLabel({ termKey, text, className }: TermLabelProps) {
  const entry = GLOSSARY[termKey];
  return (
    <span className={className}>
      {text ?? entry.term}
      <InfoTooltip label={`${entry.term} 說明`}>
        <span className="font-medium text-gray-700 dark:text-gray-200">{entry.term}</span>
        {entry.aka ? <span className="ml-1 text-gray-400">（{entry.aka}）</span> : null}
        <span className="mt-1 block">{entry.short}</span>
        {entry.example ? (
          <span className="mt-1 block text-gray-400">{entry.example}</span>
        ) : null}
      </InfoTooltip>
    </span>
  );
}
