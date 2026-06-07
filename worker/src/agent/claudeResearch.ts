/**
 * Claude CLI 研究流程（不碰 Gemini）。
 *
 * 以確定性函式蒐集資料 + TA 訊號，組成 prompt 交給 Claude（claude-agent-sdk query()），
 * 要求回傳 JSON 報告，解析後落庫。Claude 不可用 / 解析失敗 → 拋錯由呼叫端降級。
 */
import type { ResearchReportDto, ReportSource } from '@azeroth/common';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import { claudeReason } from '../llm/claude.js';
import { loadKline } from '../data/cache.js';
import { fetchStockNews, fetchInstitutionalTrades } from '../data/finmind.js';
import { loadChips } from '../data/chips.js';
import { loadFundamentals } from '../data/fundamentals.js';
import { computeIndicators, detectPatterns } from '../ta/indicators.js';
import { computeChipSummary } from '../ta/chipSignals.js';
import { computeStockScore } from '../ta/score.js';
import { generateSignal } from '../ta/signals.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 從 Claude 回應中萃取第一個 JSON 物件（容忍 ```json 圍欄與前後文字）。 */
function extractJson(text: string): Record<string, unknown> | null {
  // 先試 code fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

const SENTIMENTS = new Set(['positive', 'neutral', 'negative']);

/** Claude 撰寫研究報告。 */
export async function runClaudeResearch(symbol: string): Promise<ResearchReportDto> {
  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [ohlcv, news, inst, chips, fundamental] = await Promise.all([
    loadKline(symbol, 120),
    fetchStockNews(symbol, start).catch(() => [] as ReportSource[]),
    fetchInstitutionalTrades(symbol, start, todayStr()).catch(() => []),
    loadChips(symbol, 30).catch(() => []),
    loadFundamentals(symbol).catch(() => null),
  ]);
  if (!ohlcv.length) throw new Error(`無價格資料：${symbol}`);

  const indicators = computeIndicators(ohlcv);
  const patterns = detectPatterns(ohlcv);
  const signal = generateSignal(symbol, ohlcv);
  const chipSummary = computeChipSummary(chips);
  const score = fundamental
    ? computeStockScore({ chipBias: chipSummary.bias, signal, fundamental })
    : null;
  const lastClose = ohlcv[ohlcv.length - 1].close;
  const instNet = inst.reduce((s, t) => s + t.net, 0);

  const facts = [
    `股票代號：${symbol}`,
    `最新收盤：${lastClose}`,
    `近 ${ohlcv.length} 日資料；最新日期 ${ohlcv[ohlcv.length - 1].date}`,
    `均線：MA5=${indicators.ma5} MA20=${indicators.ma20} MA60=${indicators.ma60}`,
    `RSI14=${indicators.rsi14}；KD：K=${indicators.kd.k} D=${indicators.kd.d}`,
    `MACD：${indicators.macd.macd}/${indicators.macd.signal}/柱${indicators.macd.histogram}`,
    `布林：上${indicators.bollinger.upper} 中${indicators.bollinger.middle} 下${indicators.bollinger.lower}`,
    `量能比：${indicators.volumeRatio}`,
    `K線型態：${patterns.map((p) => `${p.code}(${p.bias})`).join('、') || '無'}`,
    `規則訊號：${signal.action}（信心 ${signal.confidence}）；理由：${signal.rationale}`,
    signal.entryZone ? `建議進場區：${signal.entryZone}；停損 ${signal.stopLoss}；停利 ${signal.takeProfit}` : '',
    `近 14 日三大法人買賣超淨額：${instNet.toLocaleString()} 股`,
    `籌碼面：${chipSummary.text}`,
    fundamental
      ? `基本面：月營收${fundamental.revenuePeriod ?? ''} YoY ${fundamental.revenueYoy ?? '-'}% MoM ${fundamental.revenueMom ?? '-'}%；EPS ${fundamental.eps ?? '-'}；本益比 ${fundamental.per ?? '-'}；殖利率 ${fundamental.dividendYield ?? '-'}%`
      : '',
    score ? `多因子評分：${score.total}/100（${score.factors.map((f) => `${f.name}${f.score}`).join('、')}）` : '',
    `近期新聞標題：${news.slice(0, 8).map((n) => n.title).join('｜') || '無'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt =
    `你是專業台股分析師。根據以下「已計算好的資料」，為 ${symbol} 撰寫一份繁體中文研究報告。\n` +
    `只能依據提供的資料推論，不要杜撰數字。\n\n` +
    `【資料】\n${facts}\n\n` +
    `【輸出格式】只輸出一個 JSON 物件（不要其他文字），鍵如下：\n` +
    `{\n` +
    `  "title": "報告標題（含股名與日期）",\n` +
    `  "summary": "3~5 句重點摘要",\n` +
    `  "sentiment": "positive | neutral | negative",\n` +
    `  "body": "Markdown 全文，需含：## 技術面 / ## 籌碼面 / ## 消息面 / ## 綜合研判（對應買賣訊號與進出場時機）"\n` +
    `}`;

  const raw = await claudeReason(prompt, { maxTurns: 3, timeoutMs: 180_000 });
  if (!raw) throw new Error('Claude 無回應（未登入或逾時）');

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed.body !== 'string') {
    throw new Error('Claude 回應無法解析為報告 JSON');
  }

  const sentiment = SENTIMENTS.has(String(parsed.sentiment))
    ? (parsed.sentiment as 'positive' | 'neutral' | 'negative')
    : 'neutral';

  return {
    symbol,
    reportDate: todayStr(),
    title: typeof parsed.title === 'string' ? parsed.title : `${symbol} 研究報告（${todayStr()}）`,
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary
        : '（本篇未提供摘要，請點開完整報告）',
    body: `${parsed.body}\n\n---\n${STOCK_DISCLAIMER}`,
    sources: news.slice(0, 10),
    sentiment,
  };
}
