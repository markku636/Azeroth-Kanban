/**
 * 研究流程 — 只用 Claude Code CLI（不依賴 Gemini / LangChain / deepagents）。
 *
 * runResearchAgent(symbol)：
 *   - 先 runClaudeResearch（直接呼叫 claude CLI 撰報告）
 *   - 失敗（claude 未就緒 / 解析失敗）→ buildFallbackReport（純資料 + TA 組裝）
 */
import type { ResearchReportDto, ReportSource } from '@azeroth/common';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import { runClaudeResearch } from './claudeResearch.js';
import { log } from '../logger.js';
import { loadKline } from '../data/cache.js';
import { fetchStockNews, fetchInstitutionalTrades } from '../data/finmind.js';
import { computeIndicators } from '../ta/indicators.js';
import { generateSignal } from '../ta/signals.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 降級報告：Claude 不可用時，用資料 + TA 組裝一份基本報告。 */
async function buildFallbackReport(symbol: string): Promise<ResearchReportDto> {
  const end = todayStr();
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let newsFailed = false;
  let instFailed = false;
  const [ohlcv, news, inst] = await Promise.all([
    loadKline(symbol, 120).catch((e) => {
      log.warn('降級報告 K 線取得失敗', { symbol, error: (e as Error).message });
      return [];
    }),
    fetchStockNews(symbol, start).catch((e) => {
      newsFailed = true;
      log.warn('降級報告新聞取得失敗', { symbol, error: (e as Error).message });
      return [] as ReportSource[];
    }),
    fetchInstitutionalTrades(symbol, start, end).catch((e) => {
      instFailed = true;
      log.warn('降級報告法人資料取得失敗', { symbol, error: (e as Error).message });
      return [];
    }),
  ]);

  const indicators = ohlcv.length ? computeIndicators(ohlcv) : null;
  const signal = ohlcv.length ? generateSignal(symbol, ohlcv) : null;
  const lastClose = ohlcv.length ? ohlcv[ohlcv.length - 1].close : null;
  const instNet = inst.reduce((s, t) => s + t.net, 0);
  const newsLines = news.slice(0, 8).map((n) => `- [${n.title}](${n.url})${n.publisher ? `（${n.publisher}）` : ''}`);

  const body = [
    `# ${symbol} 研究報告（資料摘要版）`,
    '',
    '## 技術面',
    lastClose != null ? `- 最新收盤：${lastClose}` : '- 無價格資料',
    indicators ? `- MA5/MA20/MA60：${indicators.ma5 ?? '-'} / ${indicators.ma20 ?? '-'} / ${indicators.ma60 ?? '-'}` : '',
    indicators ? `- RSI14：${indicators.rsi14 ?? '-'}；KD：K=${indicators.kd.k ?? '-'} D=${indicators.kd.d ?? '-'}` : '',
    indicators ? `- 量能比：${indicators.volumeRatio ?? '-'}` : '',
    signal ? `- 規則訊號：**${signal.action}**（信心 ${signal.confidence}）— ${signal.rationale}` : '',
    '',
    '## 籌碼面',
    inst.length
      ? `- 近 30 日三大法人合計買賣超淨額：${instNet.toLocaleString()} 股`
      : instFailed
        ? '- 法人資料暫時無法取得'
        : '- 近 30 日無三大法人買賣超資料',
    '',
    '## 消息面',
    newsLines.length
      ? newsLines.join('\n')
      : newsFailed
        ? '- 新聞暫時無法取得'
        : '- 近期無相關新聞',
    '',
    '## 綜合研判',
    signal ? `綜合技術面，目前傾向 **${signal.action}**。${signal.timingNote ?? ''}` : '資料不足，建議觀望。',
    '',
    '> ⚠️ 本報告為 Claude 未就緒時的資料摘要版（未經 AI 深度研判）。',
    '',
    '---',
    STOCK_DISCLAIMER,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    symbol,
    reportDate: end,
    title: `${symbol} 研究報告（${end}）`,
    summary: signal
      ? `規則訊號 ${signal.action}（信心 ${signal.confidence}）。法人淨額 ${instNet.toLocaleString()} 股，近期新聞 ${news.length} 則。`
      : `${symbol} 資料摘要報告。`,
    body,
    sources: news.slice(0, 10),
    sentiment: 'neutral',
  };
}

/** 對外：產生個股研究報告（Claude CLI；失敗則資料摘要降級）。 */
export async function runResearchAgent(symbol: string): Promise<ResearchReportDto> {
  try {
    return await runClaudeResearch(symbol);
  } catch (e) {
    log.error('Claude 研究失敗，改用降級報告', { symbol, error: (e as Error).message });
    return buildFallbackReport(symbol);
  }
}
