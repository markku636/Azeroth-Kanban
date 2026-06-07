import { GLOSSARY, GLOSSARY_GROUPS } from '@/config/financial-glossary';

/**
 * 名詞速查表頁：把全站股票名詞依分類列出，含白話一句話 + 詳解 + 範例圖解。
 * 給小白「一站查清」的全站說明區塊（Server Component，純靜態渲染）。
 */
export default function StockGlossaryPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">名詞速查表</h1>
        <p className="mt-1 text-sm text-gray-500">
          看不懂後台的股票名詞？這裡用白話 + 範例一次說清楚。各頁面的名詞旁也有 ⓘ 可隨點隨看。
        </p>
      </header>

      {GLOSSARY_GROUPS.map((group) => (
        <section key={group.title} className="rounded-lg border p-4 dark:border-gray-700">
          <h2 className="mb-3 text-lg font-semibold">{group.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.keys.map((key) => {
              const entry = GLOSSARY[key];
              return (
                <article
                  key={key}
                  className="rounded-md border bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/30"
                >
                  <h3 className="font-medium">
                    {entry.term}
                    {entry.aka ? (
                      <span className="ml-1 text-xs font-normal text-gray-400">{entry.aka}</span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {entry.short}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">{entry.detail}</p>
                  {entry.example ? (
                    <p className="mt-2 rounded bg-white px-2 py-1 text-xs text-gray-500 dark:bg-gray-900">
                      {entry.example}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-xs text-gray-400">
        ⚠️ 以上說明僅供認識名詞與輔助判讀，非投資建議；實際投資請自行評估風險。
      </p>
    </div>
  );
}
