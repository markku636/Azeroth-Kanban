/**
 * 自然語言問答 processor。
 * 使用者用白話問（如「2330 現在可以買嗎？為什麼？」），
 * 取出代號、帶入即時資料 + TA 訊號，交給 Claude 回答。
 * 結果作為 job return value 回傳（admin 以 waitUntilFinished 同步取回）。
 */
import type { Job } from 'bullmq';
import type { QaJobData, QaJobResult } from '../queue/queues.js';
import type { StockOhlcv, StockIndicators, TradeSignal } from '@azeroth/common';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import { log } from '../logger.js';
import { loadKline } from '../data/cache.js';
import { computeIndicators } from '../ta/indicators.js';
import { generateSignal } from '../ta/signals.js';
import { claudeReason } from '../llm/claude.js';

/** 從問題字串抓第一個 4–6 位數台股代號（含 ETF）。 */
function extractSymbol(text: string): string | undefined {
  const m = text.match(/\b(\d{4,6})\b/);
  return m?.[1];
}

const fmt = (v: number | null | undefined): string => (v == null ? '—' : String(v));

/** 用規則訊號 + 指標組一段技術快答（Claude 不可用時的降級內容）。 */
function buildRuleSnapshot(
  symbol: string,
  last: StockOhlcv,
  ind: StockIndicators,
  sig: TradeSignal,
): string {
  let plan = '';
  if (sig.action === 'BUY' && sig.entryZone) {
    plan = `參考進場 ${sig.entryZone}、停損 ${fmt(sig.stopLoss)}、停利 ${fmt(sig.takeProfit)}`;
  } else if (sig.entryZone) {
    plan = `參考區間 ${sig.entryZone}`;
  }
  const lines = [
    `📊 ${symbol} 技術快答（${last.date}，收盤 ${last.close}）`,
    `規則訊號：${sig.action}（信心 ${sig.confidence}）`,
    sig.rationale,
    `均線 MA5/20/60＝${fmt(ind.ma5)}/${fmt(ind.ma20)}/${fmt(ind.ma60)}；` +
      `RSI14＝${fmt(ind.rsi14)}；KD K/D＝${fmt(ind.kd.k)}/${fmt(ind.kd.d)}；量能比＝${fmt(ind.volumeRatio)}`,
    plan,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Claude 回 null 時的降級答覆：有資料就給技術快答，否則給引導。 */
function buildDegradedAnswer(symbol: string | undefined, snapshot: string | null): string {
  if (snapshot) {
    return `（AI 深度研判暫不可用，以下為規則訊號快答）\n${snapshot}\n\n${STOCK_DISCLAIMER}`;
  }
  const head = '（AI 深度研判暫不可用）';
  if (symbol) {
    return (
      `${head}\n你問的是 ${symbol}，但目前查不到足夠的價格資料。` +
      `可稍後再試，或先用 /watch ${symbol} 加入關注以排程抓取。`
    );
  }
  return `${head}\n請附上股票代號（例如「2330 現在可以買嗎」），或用 /signal 2330 等指令。`;
}

export async function processQa(job: Job<QaJobData>): Promise<QaJobResult> {
  const question = job.data.question.trim();
  const symbol = job.data.symbol ?? extractSymbol(question);

  let context = '';
  let snapshot: string | null = null;
  if (symbol) {
    try {
      const ohlcv = await loadKline(symbol, 120);
      if (ohlcv.length) {
        const ind = computeIndicators(ohlcv);
        const sig = generateSignal(symbol, ohlcv);
        const last = ohlcv[ohlcv.length - 1];
        context =
          `\n【${symbol} 即時資料（${last.date}）】\n` +
          `收盤 ${last.close}；MA5/20/60=${fmt(ind.ma5)}/${fmt(ind.ma20)}/${fmt(ind.ma60)}；` +
          `RSI14=${fmt(ind.rsi14)}；KD K=${fmt(ind.kd.k)} D=${fmt(ind.kd.d)}；MACD柱=${fmt(ind.macd.histogram)}；量能比=${fmt(ind.volumeRatio)}\n` +
          `規則訊號：${sig.action}（信心 ${sig.confidence}）— ${sig.rationale}\n` +
          (sig.entryZone ? `參考進場 ${sig.entryZone}、停損 ${fmt(sig.stopLoss)}、停利 ${fmt(sig.takeProfit)}\n` : '');
        snapshot = buildRuleSnapshot(symbol, last, ind, sig);
      }
    } catch (e) {
      log.warn('QA 取資料失敗', { symbol, error: (e as Error).message });
    }
  }

  const prompt =
    `你是台股投資助理。用繁體中文、簡潔（200 字內）回答使用者問題。` +
    `若有提供即時資料就務必依據它，不要杜撰數字；客觀說明多空與風險，並提醒此非投資建議。\n\n` +
    `使用者問題：${question}\n${context}`;

  const answer = await claudeReason(prompt, { maxTurns: 2, timeoutMs: 120_000 });

  if (!answer) {
    return { answer: buildDegradedAnswer(symbol, snapshot) };
  }
  log.info('qa done', { symbol, qlen: question.length });
  return { answer: `${answer}\n\n${STOCK_DISCLAIMER}` };
}
