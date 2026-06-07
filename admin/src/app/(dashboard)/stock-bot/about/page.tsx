import { DATA_SOURCE_TABLE } from '@/config/data-sources';

export default function StockAboutPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">資料來源說明</h1>
        <p className="text-sm text-gray-500">本機器人所有股票數據的來源與性質，公開透明。</p>
      </header>

      <section className="overflow-x-auto rounded-lg border p-4">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-gray-500 [&>th]:px-3 [&>th]:py-2">
              <th className="py-1">數據</th>
              <th>來源</th>
              <th>資料集 / 端點</th>
              <th>說明</th>
            </tr>
          </thead>
          <tbody>
            {DATA_SOURCE_TABLE.map((s) => (
              <tr key={s.data} className="border-t align-top [&>td]:px-3 [&>td]:py-2">
                <td className="py-1 font-medium">{s.data}</td>
                <td>{s.source}</td>
                <td className="font-mono text-xs text-gray-600">{s.dataset}</td>
                <td className="text-gray-600">{s.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border bg-gray-50 p-4 text-sm dark:bg-gray-900">
        <h2 className="mb-2 font-semibold">重要說明</h2>
        <ul className="list-disc space-y-1 pl-5 text-gray-600">
          <li>
            主要資料來源為 <b>FinMind</b>（開源台股資料 API）與 <b>TWSE 證交所官方 OpenAPI</b>
            ，皆為免費。
          </li>
          <li>
            所有數據為 <b>盤後 / 延遲</b>，非即時報價；即時行情需券商 / 富果等付費 API。
          </li>
          <li>抓取的資料快取於後端資料庫，減少重複請求並支援回測。</li>
          <li>
            AI（Claude）僅負責「分析與撰寫報告」，<b>不提供原始數據</b>。
          </li>
          <li>
            建議於 finmind.github.io 免費註冊 token 並填入 <code>FINMIND_TOKEN</code>，額度
            300→600/hr。
          </li>
          <li>
            所有訊號 / 評分 / 報告皆為資訊參考，<b>非投資建議</b>。
          </li>
        </ul>
      </section>
    </div>
  );
}
