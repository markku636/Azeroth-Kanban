import { GLOSSARY, type GlossaryKey } from '@/config/financial-glossary';

interface BeginnerGuideProps {
  /** 面板標題（預設「📖 新手導覽」） */
  title?: string;
  /** 要列出的名詞 keys */
  keys: GlossaryKey[];
  /** 是否預設展開（預設收合，避免占畫面） */
  defaultOpen?: boolean;
}

/**
 * 可收合的「新手導覽」說明區塊。使用原生 `<details>`，無需 JS 狀態、不必標 'use client'。
 * 列出本頁關鍵名詞的白話一句話 + 範例；想看完整解釋可到「名詞速查表」頁。
 */
export function BeginnerGuide({
  title = '📖 新手導覽：這頁的名詞怎麼看',
  keys,
  defaultOpen = false,
}: BeginnerGuideProps) {
  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-blue-100 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20"
    >
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300">
        {title}
      </summary>
      <dl className="space-y-2.5 border-t border-blue-100 px-4 py-3 text-sm dark:border-blue-900/60">
        {keys.map((key) => {
          const entry = GLOSSARY[key];
          return (
            <div key={key}>
              <dt className="font-medium text-gray-700 dark:text-gray-200">
                {entry.term}
                {entry.aka ? (
                  <span className="ml-1 text-xs font-normal text-gray-400">{entry.aka}</span>
                ) : null}
              </dt>
              <dd className="text-gray-600 dark:text-gray-400">
                {entry.short}
                {entry.example ? (
                  <span className="mt-0.5 block text-xs text-gray-400">{entry.example}</span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
