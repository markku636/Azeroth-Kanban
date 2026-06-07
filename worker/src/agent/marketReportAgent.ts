/**
 * 大盤盤勢解讀流程 — 只用 Claude Code CLI（不依賴 Gemini）。
 *
 * runMarketReportAgent()：
 *   - 先 runClaudeMarketResearch（直接呼叫 claude CLI 撰報告）
 *   - 失敗（claude 未就緒 / 解析失敗 / 無資料）→ buildMarketFallbackReport（規則式決策級摘要）
 */
import type { MarketReportDto, UsIndexQuote, FuturesChip } from '@azeroth/common';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import {
  runClaudeMarketResearch,
  buildDerivedSignals,
  type MarketDerivedSignals,
} from './claudeMarketResearch.js';
import { log } from '../logger.js';
import { prisma } from '../db.js';

interface SectorChange {
  name: string;
  changePct: number;
}

// ---------------------------------------------------------------------------
// 規則式方向分數：Claude 未就緒時，用衍生訊號加權出方向偏向（正=偏多、負=偏空）。
// ---------------------------------------------------------------------------

/** 加權指數漲跌方向權重。 */
const SCORE_TAIEX = 1;
/** 市場廣度（漲跌比）方向權重。 */
const SCORE_BREADTH = 1;
/** 基差深度偏離方向權重（夜盤強烈表態，較高權重）。 */
const SCORE_BASIS_DEEP = 2;
/** 基差輕度偏離方向權重。 */
const SCORE_BASIS_SHALLOW = 1;
/** 外資台指期淨未平倉方向權重。 */
const SCORE_FOREIGN = 2;
/** SOX 事件級重挫權重（單向偏空）。 */
const SCORE_SOX = 2;
/** 總分 ≥ 此值 → 偏多。 */
const SCORE_BULLISH_MIN = 2;
/** 總分 ≤ 此值 → 偏空。 */
const SCORE_BEARISH_MAX = -2;

type Sentiment = NonNullable<MarketReportDto['sentiment']>;

interface DirectionVerdict {
  sentiment: Sentiment;
  /** 方向偏向白話標籤：偏多 / 中性偏多 / 中性 / 中性偏空 / 偏空 */
  label: string;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) {
    return '—';
  }
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/** 由衍生訊號 + 加權指數漲跌算出規則式方向分數。 */
function computeDirectionScore(
  taiexChangePct: number | null,
  signals: MarketDerivedSignals,
): number {
  let score = 0;
  if (taiexChangePct !== null) {
    score += taiexChangePct >= 0 ? SCORE_TAIEX : -SCORE_TAIEX;
  }
  if (signals.declineRatio > 1) {
    score -= SCORE_BREADTH;
  } else if (signals.declineRatio < 1) {
    score += SCORE_BREADTH;
  }
  if (signals.basisPct !== null && signals.basisPct !== 0) {
    const weight = signals.basisDeep ? SCORE_BASIS_DEEP : SCORE_BASIS_SHALLOW;
    score += signals.basisPct < 0 ? -weight : weight;
  }
  if (signals.foreignNetOi !== null && signals.foreignNetOi !== 0) {
    score += signals.foreignNetOi < 0 ? -SCORE_FOREIGN : SCORE_FOREIGN;
  }
  if (signals.soxCrash) {
    score -= SCORE_SOX;
  }
  return score;
}

/** 分數 → 方向偏向（sentiment + 白話標籤）。 */
function scoreToVerdict(score: number): DirectionVerdict {
  if (score >= SCORE_BULLISH_MIN) {
    return { sentiment: 'bullish', label: '偏多' };
  }
  if (score <= SCORE_BEARISH_MAX) {
    return { sentiment: 'bearish', label: '偏空' };
  }
  if (score > 0) {
    return { sentiment: 'neutral', label: '中性偏多' };
  }
  if (score < 0) {
    return { sentiment: 'neutral', label: '中性偏空' };
  }
  return { sentiment: 'neutral', label: '中性' };
}

/** 規則式「隔日劇本」（依方向與訊號組裝，純資料推論）。 */
function buildScenarios(verdict: DirectionVerdict, signals: MarketDerivedSignals): string[] {
  const bearish = verdict.sentiment === 'bearish' || verdict.label === '中性偏空';
  if (bearish) {
    const trigger = [
      signals.basisDeep && (signals.basisPct ?? 0) < 0 ? '夜盤深度逆價差' : '',
      signals.soxCrash ? '美股半導體重挫' : '',
      (signals.foreignNetOi ?? 0) < 0 ? '外資期貨偏空' : '',
    ]
      .filter(Boolean)
      .join('、');
    return [
      `- **情境 A（機率較高）— 開低走低**：觸發＝${trigger || '空方續壓'}持續且外資現貨續賣；走法＝開盤向期貨靠攏、反彈不過前高即弱，破前低不接刀。`,
      '- **情境 B — 開低後基差收斂反彈（急殺打底）**：觸發＝開盤殺到位、外資現貨翻買、無新利空；走法＝深度逆價差易引發軋空 V 彈，此時空手最安全、放空務必嚴設停損。',
      '- **情境 C — 開低盤整量縮**：觸發＝觀望氣氛、等隔夜美股方向；走法＝區間操作、不戀戰。',
    ];
  }
  const bullish = verdict.sentiment === 'bullish' || verdict.label === '中性偏多';
  if (bullish) {
    return [
      '- **情境 A（機率較高）— 開高走高**：觸發＝國際盤偏多、夜盤溢價、外資偏多；走法＝留意量能是否跟上，過前高轉強。',
      '- **情境 B — 開高拉回**：觸發＝獲利了結、量能未跟上；走法＝拉回不破關鍵支撐可逢低布局抗跌標的。',
    ];
  }
  return [
    '- **情境 A — 區間整理**：方向訊號分歧，開盤多空拉鋸；走法＝等明確訊號再進場、不預設立場。',
    '- **情境 B — 跟隨隔夜美股／權值表態**：觀察開盤後半導體權值與外資現貨方向決定偏向。',
  ];
}

/** 固定的「明日觀察重點」檢查清單。 */
function buildWatchPoints(): string[] {
  return [
    '- 基差是否收斂：現貨開盤若未跟上夜盤跌幅 / 期貨先彈 → 偏多訊號。',
    '- 外資現貨買賣超：盤中翻買＝止跌訊號；持續大賣＝續弱。',
    '- 半導體權值（台積電等）開盤跳空幅度：高度決定大盤方向。',
    '- 加權 / 期貨支撐與壓力參考位：破支撐續弱、過壓力轉強。',
    '- 隔夜美股期指方向：盤中變數來源。',
  ];
}

/** 方向偏向與操作依據（由方向標籤產生，含停損 / 風控）。 */
function buildActionBasis(verdict: DirectionVerdict): string {
  if (verdict.sentiment === 'bearish' || verdict.label === '中性偏空') {
    return (
      `方向偏向：**${verdict.label}**。操作傾向：不宜開盤追多（接刀風險）；` +
      `夜盤若已大幅反映利空，亦不宜貿然追空（軋空反彈風險），以觀望 + 等基差收斂與外資方向確認為主。` +
      `持股者先檢視停損價、降低槓桿。`
    );
  }
  if (verdict.sentiment === 'bullish' || verdict.label === '中性偏多') {
    return (
      `方向偏向：**${verdict.label}**。操作傾向：開高不追高、留意量能是否跟上；` +
      `拉回不破關鍵支撐可逢低布局相對抗跌標的，設好停損。`
    );
  }
  return `方向偏向：**中性**。操作傾向：區間操作、不戀戰，等明確訊號（基差、外資、權值）再決定方向。`;
}

/** 降級報告：Claude 不可用時，用已落庫資料 + 規則式方向分數組裝決策級摘要。 */
async function buildMarketFallbackReport(): Promise<MarketReportDto> {
  const [market, global] = await Promise.all([
    prisma.marketDaily.findFirst({ orderBy: { date: 'desc' } }),
    prisma.globalMarketDaily.findFirst({ orderBy: { date: 'desc' } }),
  ]);
  if (!market) {
    throw new Error('無大盤資料（請先更新大盤）');
  }

  const marketDate = market.date.toISOString().slice(0, 10);
  const sectors = Array.isArray(market.sectors)
    ? (market.sectors as unknown as SectorChange[])
    : [];
  const usIndices = Array.isArray(global?.usIndices)
    ? (global!.usIndices as unknown as UsIndexQuote[])
    : [];
  const futChips =
    global?.futChips && typeof global.futChips === 'object' && !Array.isArray(global.futChips)
      ? (global.futChips as unknown as FuturesChip)
      : null;

  const advancers = market.advancers ?? 0;
  const decliners = market.decliners ?? 0;
  const topGainers = sectors.slice(0, 5).map((s) => `${s.name} ${fmtPct(s.changePct)}`);
  const topLosers = sectors
    .slice(-5)
    .reverse()
    .map((s) => `${s.name} ${fmtPct(s.changePct)}`);
  const usLines = usIndices.map((u) => `- ${u.name}：${u.close}（${fmtPct(u.changePct)}）`);

  const signals = buildDerivedSignals({
    taiexClose: market.taiexClose,
    advancers,
    decliners,
    usIndices,
    txfBasis: global?.txfBasis ?? null,
    futChips,
  });
  const score = computeDirectionScore(market.taiexChangePct, signals);
  const verdict = scoreToVerdict(score);

  const body = [
    `# 大盤盤勢解讀（資料摘要版 ${marketDate}）`,
    '',
    '## 一句話結論',
    `方向偏向 **${verdict.label}**：加權指數 ${fmtPct(market.taiexChangePct)}、廣度漲 ${advancers} / 跌 ${decliners}${signals.soxCrash ? '，且美股半導體重挫' : ''}。`,
    '',
    '## 國際盤',
    usLines.length ? usLines.join('\n') : '- 無國際盤資料',
    global?.txfNightClose != null
      ? `- 台指期夜盤（近月）：${global.txfNightClose}（${fmtPct(global.txfNightChangePct)}）；基差 ${global.txfBasis ?? '—'}`
      : '',
    '',
    '## 大盤指數與廣度',
    `- 加權指數收盤：${market.taiexClose ?? '—'}，漲跌 ${fmtPct(market.taiexChangePct)}`,
    `- 市場廣度：上漲 ${advancers} 家、下跌 ${decliners} 家、平盤 ${market.unchanged ?? 0} 家`,
    '',
    '## 類股輪動',
    `- 領漲：${topGainers.join('、') || '無'}`,
    `- 領跌：${topLosers.join('、') || '無'}`,
    '',
    '## 期貨與籌碼',
    futChips
      ? `- 三大法人台指期淨未平倉（正=偏多、負=偏空）：外資 ${futChips.foreign.netOi} 口、投信 ${futChips.trust.netOi} 口、自營商 ${futChips.dealer.netOi} 口`
      : '- 無三大法人未平倉資料',
    ...signals.lines.map((l) => `- ${l}`),
    '',
    '## 隔日劇本',
    ...buildScenarios(verdict, signals),
    '',
    '## 明日觀察重點',
    ...buildWatchPoints(),
    '',
    '## 方向偏向與操作依據',
    buildActionBasis(verdict),
    '',
    '> ⚠️ 本報告為 Claude 未就緒時的「資料摘要版」（規則式研判，未經 AI 深度推理）。',
    '',
    '---',
    STOCK_DISCLAIMER,
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')) // 去除因條件式產生的連續空行
    .join('\n');

  return {
    reportDate: marketDate,
    title: `大盤盤勢解讀（${marketDate}）`,
    summary: `方向偏向 ${verdict.label}：加權 ${fmtPct(market.taiexChangePct)}，廣度漲 ${advancers} / 跌 ${decliners}${signals.soxCrash ? '，美股半導體重挫' : ''}。（資料摘要版）`,
    body,
    sentiment: verdict.sentiment,
    degraded: true,
  };
}

/** 對外：產生大盤盤勢解讀報告（Claude CLI；失敗則規則式決策級降級）。 */
export async function runMarketReportAgent(): Promise<MarketReportDto> {
  try {
    return await runClaudeMarketResearch();
  } catch (e) {
    log.error('Claude 大盤研究失敗，改用降級報告', { error: (e as Error).message });
    return buildMarketFallbackReport();
  }
}
