/**
 * Claude CLI 大盤盤勢解讀（不碰 Gemini）。
 *
 * 讀取已落庫的大盤 / 國際盤資料，組成 prompt 交給 Claude（claude-agent-sdk query()），
 * 要求回傳 JSON「決策級」報告（含隔日劇本 / 明日觀察重點 / 方向偏向與操作依據），解析後回傳。
 * Claude 不可用 / 解析失敗 / 無資料 → 拋錯由呼叫端降級。
 */
import type { MarketReportDto, UsIndexQuote, FuturesChip } from '@azeroth/common';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import { claudeReason } from '../llm/claude.js';
import { prisma } from '../db.js';

interface SectorChange {
  name: string;
  changePct: number;
}

const SENTIMENTS = new Set(['bullish', 'neutral', 'bearish']);

/** 外資台指期淨未平倉「極端偏向」門檻（口）。 */
const FOREIGN_OI_EXTREME = 60_000;
/** 外資台指期淨未平倉「明顯偏向」門檻（口）。 */
const FOREIGN_OI_NOTABLE = 30_000;
/** 費城半導體單日跌幅達此值（%）視為事件級重挫（對台股權值衝擊大）。 */
const SOX_CRASH_PCT = -5;
/** 基差佔指數比達此絕對值（%）視為深度偏離（夜盤大幅折/溢價、已反映大量預期）。 */
const BASIS_DEEP_PCT = 2;

/** 美股 symbol → 中文看板標籤（與大盤頁一致）。 */
const US_INDEX_LABELS: Record<string, string> = {
  '^DJI': '道瓊',
  '^GSPC': 'S&P 500',
  '^IXIC': '那斯達克',
  '^SOX': '費城半導體',
};

function usLabel(q: UsIndexQuote): string {
  return US_INDEX_LABELS[q.symbol] ?? q.name;
}

/** 從 Claude 回應中萃取第一個 JSON 物件（容忍 ```json 圍欄與前後文字）。 */
function extractJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence?.[1], text];
  for (const c of candidates) {
    if (!c) {
      continue;
    }
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start === -1 || end <= start) {
      continue;
    }
    try {
      return JSON.parse(c.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) {
    return '—';
  }
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// 衍生訊號：對已落庫資料做確定性計算，幫 LLM / 降級報告穩定推論（不杜撰數字）。
// ---------------------------------------------------------------------------

/** `buildDerivedSignals()` 輸入。 */
export interface MarketDerivedInput {
  taiexClose: number | null;
  advancers: number;
  decliners: number;
  usIndices: UsIndexQuote[];
  txfBasis: number | null;
  futChips: FuturesChip | null;
}

/** 衍生訊號結果：`lines` 給報告文字，其餘數值供規則式評分使用。 */
export interface MarketDerivedSignals {
  /** 給報告 / prompt 的衍生訊號文字行 */
  lines: string[];
  /** 基差佔指數比（%），null = 無法計算 */
  basisPct: number | null;
  /** 基差是否深度偏離（|basisPct| ≥ 門檻） */
  basisDeep: boolean;
  /** 漲跌比 = 跌家數 / max(漲家數, 1) */
  declineRatio: number;
  /** 外資淨未平倉（口），null = 無資料 */
  foreignNetOi: number | null;
  /** SOX 是否事件級重挫 */
  soxCrash: boolean;
  /** 美股最弱指數漲跌%（null = 無資料） */
  weakestUsPct: number | null;
}

function computeBasis(
  taiexClose: number | null,
  txfBasis: number | null,
): { pct: number | null; line: string | null } {
  if (txfBasis === null || txfBasis === undefined || !taiexClose) {
    return { pct: null, line: null };
  }
  const pct = (txfBasis / taiexClose) * 100;
  const dir = pct < 0 ? '折價（偏空）' : '溢價（偏多）';
  const implied =
    pct < 0 ? `隱含現貨開低約 ${Math.abs(pct).toFixed(1)}%` : `隱含現貨開高約 ${pct.toFixed(1)}%`;
  const deep =
    Math.abs(pct) >= BASIS_DEEP_PCT
      ? '（深度偏離：夜盤已大幅反映預期，追單賠率差、易出現基差收斂的反向波動）'
      : '';
  return {
    pct,
    line: `基差佔指數比：${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%（${dir}），若開盤向期貨靠攏則${implied}${deep}`,
  };
}

function computeBreadth(advancers: number, decliners: number): { ratio: number; line: string } {
  const ratio = decliners / Math.max(advancers, 1);
  const dir = advancers > decliners ? '偏多' : advancers < decliners ? '偏空' : '中性';
  return {
    ratio,
    line: `漲跌比：跌/漲 = ${ratio.toFixed(2)}（廣度${dir}；>1 代表下跌家數較多）`,
  };
}

function oiStrength(netOi: number): string {
  const abs = Math.abs(netOi);
  if (abs >= FOREIGN_OI_EXTREME) {
    return '極端';
  }
  if (abs >= FOREIGN_OI_NOTABLE) {
    return '明顯';
  }
  return '輕微';
}

function computeForeignOi(
  futChips: FuturesChip | null,
): { netOi: number | null; line: string | null } {
  if (!futChips) {
    return { netOi: null, line: null };
  }
  const netOi = futChips.foreign.netOi;
  const side = netOi < 0 ? '淨空（偏空）' : netOi > 0 ? '淨多（偏多）' : '中性';
  return {
    netOi,
    line: `外資台指期淨未平倉：${netOi} 口，${oiStrength(netOi)}${side}`,
  };
}

function computeUsWeakness(
  usIndices: UsIndexQuote[],
): { weakestPct: number | null; soxCrash: boolean; lines: string[] } {
  const lines: string[] = [];
  const rated = usIndices.filter((u) => u.changePct !== null);
  if (!rated.length) {
    return { weakestPct: null, soxCrash: false, lines };
  }
  const weakest = rated.reduce((min, u) =>
    (u.changePct as number) < (min.changePct as number) ? u : min,
  );
  lines.push(`美股最弱指數：${usLabel(weakest)} ${fmtPct(weakest.changePct)}`);
  const sox = usIndices.find((u) => u.symbol === '^SOX');
  const soxCrash = !!sox && sox.changePct !== null && sox.changePct <= SOX_CRASH_PCT;
  if (soxCrash && sox) {
    lines.push(
      `⚠️ 費城半導體（SOX）${fmtPct(sox.changePct)} 事件級重挫，對台股半導體權值（台積電等）傳導壓力最大`,
    );
  }
  return { weakestPct: weakest.changePct, soxCrash, lines };
}

/** 組裝衍生訊號（純函式；claude 報告與降級報告共用）。 */
export function buildDerivedSignals(input: MarketDerivedInput): MarketDerivedSignals {
  const basis = computeBasis(input.taiexClose, input.txfBasis);
  const breadth = computeBreadth(input.advancers, input.decliners);
  const foreign = computeForeignOi(input.futChips);
  const us = computeUsWeakness(input.usIndices);

  const lines = [basis.line, breadth.line, foreign.line, ...us.lines].filter(
    (l): l is string => !!l,
  );

  return {
    lines,
    basisPct: basis.pct,
    basisDeep: basis.pct !== null && Math.abs(basis.pct) >= BASIS_DEEP_PCT,
    declineRatio: breadth.ratio,
    foreignNetOi: foreign.netOi,
    soxCrash: us.soxCrash,
    weakestUsPct: us.weakestPct,
  };
}

/** `buildFacts()` 輸入（欄位多，依 coding-standards 改用 options object）。 */
interface MarketFactsInput {
  marketDate: string;
  taiexClose: number | null;
  taiexChangePct: number | null;
  advancers: number;
  decliners: number;
  unchanged: number;
  sectors: SectorChange[];
  usIndices: UsIndexQuote[];
  txfNight: { close: number | null; changePct: number | null; basis: number | null };
  futChips: FuturesChip | null;
}

/** 組裝餵給 Claude 的「已計算好」大盤事實清單（含衍生訊號）。 */
function buildFacts(input: MarketFactsInput): string {
  const { marketDate, taiexClose, taiexChangePct, advancers, decliners, unchanged } = input;
  const { sectors, usIndices, txfNight, futChips } = input;

  const topGainers = sectors.slice(0, 5).map((s) => `${s.name} ${fmtPct(s.changePct)}`);
  const topLosers = sectors
    .slice(-5)
    .reverse()
    .map((s) => `${s.name} ${fmtPct(s.changePct)}`);
  const us = usIndices.map((u) => `${usLabel(u)} ${u.close}（${fmtPct(u.changePct)}）`);
  const fut = futChips
    ? `外資淨未平倉 ${futChips.foreign.netOi} 口、投信 ${futChips.trust.netOi} 口、自營商 ${futChips.dealer.netOi} 口`
    : '無資料';

  const derived = buildDerivedSignals({
    taiexClose,
    advancers,
    decliners,
    usIndices,
    txfBasis: txfNight.basis,
    futChips,
  });

  return [
    `資料日期：${marketDate}`,
    `加權指數（TAIEX）收盤：${taiexClose ?? '—'}，漲跌 ${fmtPct(taiexChangePct)}`,
    `市場廣度：上漲 ${advancers} 家、下跌 ${decliners} 家、平盤 ${unchanged} 家`,
    `領漲類股：${topGainers.join('、') || '無'}`,
    `領跌類股：${topLosers.join('、') || '無'}`,
    `美股四大指數：${us.join('；') || '無資料'}`,
    `台指期夜盤（近月）收盤：${txfNight.close ?? '—'}，漲跌 ${fmtPct(txfNight.changePct)}；期現價差(基差) ${txfNight.basis ?? '—'}`,
    `三大法人台指期未平倉（正=偏多、負=偏空）：${fut}`,
    '',
    '【衍生訊號（系統計算，請優先採信）】',
    ...derived.lines,
  ].join('\n');
}

/** 決策級報告的 prompt（強制方向偏向 + 隔日劇本 + 觀察重點 + 操作依據）。 */
function buildPrompt(facts: string): string {
  return (
    `你是專業台股盤勢分析師。根據以下「已計算好的資料」與「衍生訊號」，撰寫一份繁體中文大盤盤勢「決策級」解讀報告，` +
    `目標是讓看不懂盤的新手也能讀懂，並可作為隔日買賣的研判依據。\n` +
    `只能依據提供的資料推論，不要杜撰任何數字；不得保證走勢，需提醒跳空與消息面風險。\n` +
    `請給出「明確方向偏向」（例如：偏多 / 中性偏多 / 中性偏空 / 偏空），同時說明風險與停損依據。\n\n` +
    `【資料】\n${facts}\n\n` +
    `【撰寫要求】\n` +
    `- summary：第一句即「一句話方向結論」（隔日偏多還偏空、主因、明日最關鍵的一件事），共 3~5 句白話。\n` +
    `- sentiment：bullish（偏多）/ neutral（中性）/ bearish（偏空），對應方向偏向。\n` +
    `- body：Markdown 全文，務必依序包含下列區段（標題用 ##）：\n` +
    `  ## 一句話結論\n` +
    `  ## 國際盤（含對台股半導體權值的傳導）\n` +
    `  ## 大盤指數與廣度\n` +
    `  ## 類股輪動（抗跌 vs 弱勢）\n` +
    `  ## 期貨與籌碼（說明基差偏離的「雙面刃」：負基差代表壞消息已反映、追空賠率差且易軋空反彈；並解讀外資未平倉方向）\n` +
    `  ## 隔日劇本（列 2~3 個情境，每個含：觸發條件 + 對應走法 + 機率高低）\n` +
    `  ## 明日觀察重點（條列：基差是否收斂、外資現貨買賣超、半導體權值如台積電開盤幅度、支撐 / 壓力參考位）\n` +
    `  ## 方向偏向與操作依據（明確方向偏向 + 操作傾向：追多 / 追空 / 觀望的依據 + 停損與風控提醒）\n\n` +
    `【輸出格式】只輸出一個 JSON 物件（不要其他文字），鍵：` +
    `{ "title": "報告標題（含日期）", "summary": "...", "sentiment": "bullish|neutral|bearish", "body": "Markdown 全文" }`
  );
}

/** Claude 撰寫大盤盤勢解讀報告。 */
export async function runClaudeMarketResearch(): Promise<MarketReportDto> {
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

  const facts = buildFacts({
    marketDate,
    taiexClose: market.taiexClose,
    taiexChangePct: market.taiexChangePct,
    advancers: market.advancers ?? 0,
    decliners: market.decliners ?? 0,
    unchanged: market.unchanged ?? 0,
    sectors,
    usIndices,
    txfNight: {
      close: global?.txfNightClose ?? null,
      changePct: global?.txfNightChangePct ?? null,
      basis: global?.txfBasis ?? null,
    },
    futChips,
  });

  const raw = await claudeReason(buildPrompt(facts), { maxTurns: 3, timeoutMs: 180_000 });
  if (!raw) {
    throw new Error('Claude 無回應（未登入或逾時）');
  }

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed.body !== 'string') {
    throw new Error('Claude 回應無法解析為報告 JSON');
  }

  const sentiment = SENTIMENTS.has(String(parsed.sentiment))
    ? (parsed.sentiment as 'bullish' | 'neutral' | 'bearish')
    : 'neutral';

  return {
    reportDate: marketDate,
    title: typeof parsed.title === 'string' ? parsed.title : `大盤盤勢解讀（${marketDate}）`,
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary
        : '（本篇未提供摘要，請點開完整報告）',
    body: `${parsed.body}\n\n---\n${STOCK_DISCLAIMER}`,
    sentiment,
    degraded: false,
  };
}
