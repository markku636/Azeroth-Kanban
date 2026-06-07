import type { BacktestParams } from '@azeroth/common';
import { TermLabel } from '@/components/stock/term-label';

/**
 * 策略說明卡：用白話講清楚這個回測「什麼時候買、什麼時候賣」。
 * 常駐在頁面（不需跑回測就能看），直接回答使用者「買進策略是什麼」。
 * 門檻以本次參數為準，未提供時用台股經典預設（K<40 買 / K>60 賣 / 9 日 KD）。
 */
export function StrategyExplainerCard({ params }: { params?: BacktestParams | null }) {
  const buyBelow = params?.buyBelow ?? 40;
  const sellAbove = params?.sellAbove ?? 60;
  const kdPeriod = params?.kdPeriod ?? 9;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm dark:border-blue-900/60 dark:bg-blue-950/20">
      <div className="mb-2 font-semibold text-gray-800 dark:text-gray-100">
        📌 這個策略在做什麼？— <TermLabel termKey="KD" text="KD" /> 低買高賣（{kdPeriod} 日）
      </div>
      <ul className="space-y-1.5 leading-relaxed text-gray-700 dark:text-gray-300">
        <li>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">🟢 什麼時候買：</span>
          當股價跌到<b>便宜區</b>（KD 的 K 值 &lt; {buyBelow}），又開始反彈翻揚（K 由下往上穿過 D，叫{' '}
          <TermLabel termKey="KD_CROSS" text="黃金交叉" />）→ <b>隔天開盤買進</b>。
        </li>
        <li>
          <span className="font-medium text-rose-600 dark:text-rose-400">🔴 什麼時候賣：</span>
          當股價漲到<b>偏貴區</b>（K 值 &gt; {sellAbove}），動能開始轉弱（K 由上往下跌破 D，叫{' '}
          <TermLabel termKey="KD_CROSS" text="死亡交叉" />）→ <b>隔天開盤賣出</b>。
        </li>
        <li className="text-gray-500 dark:text-gray-400">
          另可加停損／停利；每次用本金能買的最大股數（含零股）全額投入，賺到的再滾入下一筆（複利）。
        </li>
      </ul>
      <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-gray-600 dark:bg-black/20 dark:text-gray-300">
        💡 一句話：就是「<b>跌深反彈才買、漲多轉弱就賣</b>」的紀律操作 — 不追高、不摸頭。
      </p>
    </div>
  );
}
