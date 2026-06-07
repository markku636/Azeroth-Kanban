/**
 * 股票機器人 — 三層 service（route → service(回 ApiResult，不 throw) → prisma）。
 */
import {
  ApiErrorCode,
  applyStrategy,
  computeRiverBands,
  valuationZone,
  clampParams,
  getStrategy as getBacktestStrategy,
  listStrategyMeta,
  runStrategyBacktest,
  parseCommonParams,
  DEFAULT_COMMON_PARAMS,
  type ComparisonResult,
  type ComparisonRow,
  type BacktestEquityPoint,
  type BacktestStats,
  type DaySignal,
  type StockOhlcv,
  type UsIndexQuote,
  type FuturesChip,
  type MarketReportDto,
  type ScoringStrategyId,
  type StrategyWeights,
  type ValuationMetric,
  type ValuationPoint,
  type StockIndicators,
} from '@azeroth/common';
import { getStrategy, type ScreenRow } from '@/lib/screen-strategies';
import { computeKdVerdict } from '@/lib/kd-verdict';
import type { Bar } from '@/lib/kline-aggregate';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import {
  enqueueAnalysis,
  enqueueResearch,
  enqueueBacktest,
  enqueueComparison,
  type ComparisonEntry,
  enqueueDigest,
  enqueueScreen,
  enqueueMarket,
  enqueueGlobal,
  enqueueMarketReport,
  enqueueDispatch,
  askQuestion,
  getQueueCounts,
  getHeartbeat,
  getSchedulerNextRuns,
  applySchedule,
  EDITABLE_SCHEDULES,
  SCHEDULE_TZ,
  requeueByType,
} from '@/lib/stock-queue';
import { fetchStockInfoFromFinMind } from '@/lib/finmind';

// 台股代號：4 位（一般股）至 6 位（部分 ETF，如 006208）數字。
const SYMBOL_RE = /^\d{4,6}$/;

/** 取多個代號的名稱對照。 */
async function nameMap(symbols: string[]): Promise<Map<string, string>> {
  if (!symbols.length) {
    return new Map();
  }
  const infos = await prisma.stockInfo.findMany({ where: { symbol: { in: symbols } } });
  return new Map(infos.map((i) => [i.symbol, i.name]));
}

/** 取單一代號名稱。 */
async function stockName(symbol: string): Promise<string | null> {
  const info = await prisma.stockInfo.findUnique({ where: { symbol } });
  return info?.name ?? null;
}

/**
 * 由訊號（action/confidence）+ 綜合評分（0~100）組一句白話結論。
 * 平靜日（HOLD/信心 0）也能以綜合評分給出可讀方向，避免只剩「無明顯訊號」。
 */
function plainVerdict(action: string, confidence: number, score: number | null): string {
  if (action === 'BUY' && confidence >= 0.5) {
    return '技術面轉強，可找買點（記得設停損）';
  }
  if (action === 'SELL' && confidence >= 0.5) {
    return '技術面轉弱，宜減碼或觀望';
  }
  if (score == null) {
    return '今日無明確進出訊號，建議觀望';
  }
  if (score >= 65) {
    return '綜合體質偏強，可逢回留意';
  }
  if (score >= 50) {
    return '綜合體質中性偏多，區間操作';
  }
  if (score >= 40) {
    return '綜合體質中性偏弱，保守為宜';
  }
  return '綜合體質偏弱，暫不宜進場';
}

/** 取多個代號的最新收盤價、對前一交易日的漲跌%、以及該收盤價的交易日期。 */
async function priceMap(
  symbols: string[],
): Promise<Map<string, { close: number; changePct: number | null; priceDate: string }>> {
  const map = new Map<string, { close: number; changePct: number | null; priceDate: string }>();
  if (!symbols.length) {
    return map;
  }
  // 關注清單為使用者精選、數量小，平行取每檔最近 2 筆即可算出漲跌。
  const results = await Promise.all(
    symbols.map((symbol) =>
      prisma.stockDailyPrice.findMany({
        where: { symbol },
        orderBy: { tradeDate: 'desc' },
        take: 2,
        select: { close: true, tradeDate: true },
      }),
    ),
  );
  symbols.forEach((symbol, i) => {
    const rows = results[i];
    if (!rows.length) {
      return;
    }
    const close = rows[0].close;
    const prev = rows[1]?.close ?? null;
    const changePct =
      prev != null && prev !== 0 ? Math.round(((close - prev) / prev) * 10000) / 100 : null;
    map.set(symbol, {
      close,
      changePct,
      priceDate: rows[0].tradeDate.toISOString().slice(0, 10),
    });
  });
  return map;
}

/** 取多個代號的最新健診評分與訊號動作（與 getScreener / getFundamental 同來源）。 */
async function scoreMap(
  symbols: string[],
): Promise<Map<string, { score: number | null; action: string }>> {
  const map = new Map<string, { score: number | null; action: string }>();
  if (!symbols.length) {
    return map;
  }
  const signals = await prisma.analysisSignal.findMany({
    where: { symbol: { in: symbols }, score: { not: null } },
    orderBy: [{ symbol: 'asc' }, { createdAt: 'desc' }],
    distinct: ['symbol'],
    select: { symbol: true, score: true, action: true },
  });
  for (const s of signals) {
    map.set(s.symbol, { score: s.score, action: s.action });
  }
  return map;
}

interface WatchVerdict {
  level: WatchlistOverviewDto['verdictLevel'];
  color: WatchlistOverviewDto['verdictColor'];
  headline: string;
}

/** KD 結論等級 → 燈號顏色（買=綠、觀望=黃、避開=紅、未知=灰）。 */
function verdictColorOf(level: WatchVerdict['level']): WatchVerdict['color'] {
  if (level === 'buy') {
    return 'green';
  }
  if (level === 'wait') {
    return 'yellow';
  }
  if (level === 'avoid') {
    return 'red';
  }
  return 'gray';
}

/**
 * 多檔關注股的 KD 紅綠燈結論。
 * 單次 `in` 查詢取回所有關注股的完整日線，記憶體內依 symbol 分組後逐組算 verdict，避免 N+1。
 */
async function verdictMap(symbols: string[]): Promise<Map<string, WatchVerdict>> {
  const map = new Map<string, WatchVerdict>();
  if (!symbols.length) {
    return map;
  }
  const rows = await prisma.stockDailyPrice.findMany({
    where: { symbol: { in: symbols } },
    orderBy: [{ symbol: 'asc' }, { tradeDate: 'asc' }],
    select: {
      symbol: true,
      tradeDate: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
    },
  });
  const barsBySymbol = new Map<string, Bar[]>();
  for (const r of rows) {
    const bars = barsBySymbol.get(r.symbol) ?? [];
    bars.push({
      date: r.tradeDate.toISOString().slice(0, 10),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: Number(r.volume),
    });
    barsBySymbol.set(r.symbol, bars);
  }
  barsBySymbol.forEach((bars, symbol) => {
    const verdict = computeKdVerdict(bars);
    map.set(symbol, {
      level: verdict.level,
      color: verdictColorOf(verdict.level),
      headline: verdict.headline,
    });
  });
  return map;
}

/**
 * 多檔關注股的目標 / 停損價（複用 Alert：PRICE_ABOVE=目標、PRICE_BELOW=停損）。
 * 同 member/symbol/type 若有多筆 active alert，取最近一筆（createdAt 最新）為準。
 */
async function watchTargetsMap(
  memberId: string,
  symbols: string[],
): Promise<Map<string, { targetPrice: number | null; stopPrice: number | null }>> {
  const map = new Map<string, { targetPrice: number | null; stopPrice: number | null }>();
  if (!symbols.length) {
    return map;
  }
  const alerts = await prisma.alert.findMany({
    where: {
      memberId,
      symbol: { in: symbols },
      type: { in: ['PRICE_ABOVE', 'PRICE_BELOW'] },
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
    select: { symbol: true, type: true, threshold: true },
  });
  for (const a of alerts) {
    const entry = map.get(a.symbol) ?? { targetPrice: null, stopPrice: null };
    // orderBy desc：最先遇到者即最近一筆，後續同 type 不覆蓋。
    if (a.type === 'PRICE_ABOVE' && entry.targetPrice == null) {
      entry.targetPrice = a.threshold;
    } else if (a.type === 'PRICE_BELOW' && entry.stopPrice == null) {
      entry.stopPrice = a.threshold;
    }
    map.set(a.symbol, entry);
  }
  return map;
}

const FINMIND_BASE_URL = 'https://api.finmindtrade.com/api/v4/data';
const NEWS_LOOKBACK_DAYS = 7;
const NEWS_MAX = 20;

interface FinMindNewsRow {
  date: string;
  title: string;
  link: string;
  source: string;
}

/** 個股近 7 日新聞（FinMind TaiwanStockNews，最新在前，取 20 則）。 */
export async function getStockNews(symbol: string): Promise<ApiResult> {
  if (!isValidSymbol(symbol)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }
  try {
    const start = new Date(Date.now() - NEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const url = new URL(FINMIND_BASE_URL);
    // 注意：TaiwanStockNews 不可帶 end_date（會回 400）
    url.searchParams.set('dataset', 'TaiwanStockNews');
    url.searchParams.set('data_id', symbol);
    url.searchParams.set('start_date', start);
    const token = process.env.FINMIND_TOKEN;
    if (token) {
      url.searchParams.set('token', token);
    }
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, `新聞讀取失敗（HTTP ${res.status}）`);
    }
    const json = (await res.json()) as { data?: FinMindNewsRow[] };
    const rows = (json.data ?? [])
      .slice(-NEWS_MAX)
      .reverse()
      .map((r) => ({ date: r.date, title: r.title, link: r.link, source: r.source }));
    return ApiResponse.success(rows);
  } catch (e) {
    console.error(`[StockService.getStockNews] symbol=${symbol}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '新聞讀取失敗，請稍後再試');
  }
}

/** 全市場代號 + 名稱（供前端下拉搜尋），依代號排序。 */
export async function getStockList(): Promise<ApiResult<{ symbol: string; name: string }[]>> {
  try {
    const rows = await prisma.stockInfo.findMany({
      select: { symbol: true, name: true },
      orderBy: { symbol: 'asc' },
    });
    return ApiResponse.success(rows);
  } catch (e) {
    console.error('[StockService.getStockList]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '股票清單讀取失敗，請稍後再試');
  }
}

export interface WatchlistDto {
  id: string;
  symbol: string;
  name: string | null;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  close: number | null;
  changePct: number | null;
  /** 最新收盤價的交易日期（YYYY-MM-DD）；無行情則為 null。 */
  priceDate: string | null;
  score: number | null;
  action: string | null;
}

/** 關注清單彙整列：在 WatchlistDto 上補 KD 紅綠燈結論 + 目標/停損價。 */
export interface WatchlistOverviewDto extends WatchlistDto {
  /** 多週期 KD 傻瓜結論等級（買/觀望/避開/未知）。 */
  verdictLevel: 'buy' | 'wait' | 'avoid' | 'unknown';
  /** 結論燈號顏色（green/yellow/red/gray）。 */
  verdictColor: 'green' | 'yellow' | 'red' | 'gray';
  /** 結論一句話。 */
  verdictHeadline: string;
  /** 目標價（對應 PRICE_ABOVE alert）；未設定為 null。 */
  targetPrice: number | null;
  /** 停損價（對應 PRICE_BELOW alert）；未設定為 null。 */
  stopPrice: number | null;
}

function isValidSymbol(s: string): boolean {
  return SYMBOL_RE.test(s.trim());
}

/**
 * 手動觸發前的代號防呆：確認 sym 為真實上市櫃標的。
 *
 * 本地 `StockInfo` 只含分析過的代號（非全市場），故採混合策略：
 * 1) 格式不符 → 擋；2) 本地命中 → 放行（零網路）；
 * 3) 否則打一次 FinMind 權威查：存在則順手快取放行、查無則擋、
 *    網路/API 失敗則降級放行（不因基礎設施問題擋住使用者，worker 會再處理）。
 *
 * @returns 需擋下時回錯誤 `ApiResult`；可放行時回 `null`
 */
async function ensureTradableSymbol(sym: string): Promise<ApiResult<never> | null> {
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }

  const cached = await prisma.stockInfo.findUnique({ where: { symbol: sym } });
  if (cached) {
    return null;
  }

  try {
    const info = await fetchStockInfoFromFinMind(sym);
    if (!info) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        `查無此代號 ${sym}，請確認是否為上市櫃代號`,
        ApiErrorCode.STOCK.SYMBOL_INVALID,
      );
    }
    // 權威查到了，順手快取名稱，下次免再打網路
    await prisma.stockInfo.upsert({
      where: { symbol: sym },
      update: { name: info.name, industry: info.industry },
      create: { symbol: sym, name: info.name, industry: info.industry },
    });
    return null;
  } catch (e) {
    // FinMind 不可達/額度問題屬基礎設施失敗：降級放行，不擋使用者
    console.warn(`[StockService.ensureTradableSymbol] FinMind 查詢失敗，降級放行 sym=${sym}`, e);
    return null;
  }
}

/** 關注清單（含名稱、最新行情、健診評分）。 */
export async function listWatchlist(memberId: string): Promise<ApiResult<WatchlistDto[]>> {
  const rows = await prisma.watchlist.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
  });
  const symbols = rows.map((r) => r.symbol);
  const [names, prices, scores] = await Promise.all([
    nameMap(symbols),
    priceMap(symbols),
    scoreMap(symbols),
  ]);
  return ApiResponse.success(
    rows.map((r) => {
      const priced = prices.get(r.symbol);
      const scored = scores.get(r.symbol);
      return {
        id: r.id,
        symbol: r.symbol,
        name: names.get(r.symbol) ?? r.name ?? null,
        tags: r.tags,
        isActive: r.isActive,
        createdAt: r.createdAt,
        close: priced?.close ?? null,
        changePct: priced?.changePct ?? null,
        priceDate: priced?.priceDate ?? null,
        score: scored?.score ?? null,
        action: scored?.action ?? null,
      };
    }),
  );
}

export async function addWatch(
  memberId: string,
  symbol: string,
  name?: string,
): Promise<ApiResult<WatchlistDto>> {
  const sym = (symbol ?? '').trim();
  if (!sym) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '請提供股票代號',
      ApiErrorCode.STOCK.SYMBOL_REQUIRED,
    );
  }
  // 驗證代號真實存在（格式 + 本地快取/FinMind 權威查），杜絕 0073/9999 之類幽靈代號入列
  const guard = await ensureTradableSymbol(sym);
  if (guard) {
    return guard;
  }

  const existing = await prisma.watchlist.findUnique({
    where: { memberId_symbol: { memberId, symbol: sym } },
  });
  if (existing) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '已在關注清單中',
      ApiErrorCode.STOCK.ALREADY_WATCHED,
    );
  }

  const row = await prisma.watchlist.create({
    data: { memberId, symbol: sym, name: name ?? null },
  });
  // 新增後前端會 refresh() 重抓清單取得完整行情，故此處行情/評分欄位先填 null。
  return ApiResponse.success({
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    tags: row.tags,
    isActive: row.isActive,
    createdAt: row.createdAt,
    close: null,
    changePct: null,
    priceDate: null,
    score: null,
    action: null,
  });
}

export async function removeWatch(
  memberId: string,
  id: string,
): Promise<ApiResult<{ id: string }>> {
  const row = await prisma.watchlist.findFirst({ where: { id, memberId } });
  if (!row) {
    return ApiResponse.error(
      ApiReturnCode.NOT_FOUND,
      '找不到關注項目',
      ApiErrorCode.STOCK.WATCH_NOT_FOUND,
    );
  }
  await prisma.watchlist.delete({ where: { id } });
  return ApiResponse.success({ id });
}

/** 關注清單彙整（名稱 + 行情 + 評分 + KD 紅綠燈結論 + 目標/停損價）。 */
export async function listWatchlistOverview(
  memberId: string,
): Promise<ApiResult<WatchlistOverviewDto[]>> {
  const rows = await prisma.watchlist.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
  });
  const symbols = rows.map((r) => r.symbol);
  const [names, prices, scores, verdicts, targets] = await Promise.all([
    nameMap(symbols),
    priceMap(symbols),
    scoreMap(symbols),
    verdictMap(symbols),
    watchTargetsMap(memberId, symbols),
  ]);
  return ApiResponse.success(
    rows.map((r) => {
      const priced = prices.get(r.symbol);
      const scored = scores.get(r.symbol);
      const verdict = verdicts.get(r.symbol);
      const target = targets.get(r.symbol);
      return {
        id: r.id,
        symbol: r.symbol,
        name: names.get(r.symbol) ?? r.name ?? null,
        tags: r.tags,
        isActive: r.isActive,
        createdAt: r.createdAt,
        close: priced?.close ?? null,
        changePct: priced?.changePct ?? null,
        priceDate: priced?.priceDate ?? null,
        score: scored?.score ?? null,
        action: scored?.action ?? null,
        verdictLevel: verdict?.level ?? 'unknown',
        verdictColor: verdict?.color ?? 'gray',
        verdictHeadline: verdict?.headline ?? '資料還不夠，暫時看不出來',
        targetPrice: target?.targetPrice ?? null,
        stopPrice: target?.stopPrice ?? null,
      };
    }),
  );
}

/**
 * 設定 / 清除某 symbol 的目標價（PRICE_ABOVE）與停損價（PRICE_BELOW）。
 * 值為 null → 刪除該 member/symbol/type 既有 active alert；有值 → 更新最近一筆，無則建立。
 * 複用 Alert 引擎，worker `runAlertChecks()` 會於分析時自動檢查並推播 LINE。
 */
export async function setWatchTargets(
  memberId: string,
  symbol: string,
  targetPrice: number | null,
  stopPrice: number | null,
): Promise<ApiResult<{ symbol: string; targetPrice: number | null; stopPrice: number | null }>> {
  const sym = (symbol ?? '').trim();
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }
  if (targetPrice != null && !Number.isFinite(targetPrice)) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '目標價需為數字或留空');
  }
  if (stopPrice != null && !Number.isFinite(stopPrice)) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '停損價需為數字或留空');
  }

  try {
    await Promise.all([
      upsertPriceAlert(memberId, sym, 'PRICE_ABOVE', targetPrice),
      upsertPriceAlert(memberId, sym, 'PRICE_BELOW', stopPrice),
    ]);
    return ApiResponse.success({ symbol: sym, targetPrice, stopPrice });
  } catch (e) {
    console.error(`[StockService.setWatchTargets] memberId=${memberId} symbol=${sym}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '目標 / 停損價設定失敗，請稍後再試');
  }
}

/** 針對單一方向（target=PRICE_ABOVE / stop=PRICE_BELOW）upsert 或清除 active alert。 */
async function upsertPriceAlert(
  memberId: string,
  symbol: string,
  type: 'PRICE_ABOVE' | 'PRICE_BELOW',
  value: number | null,
): Promise<void> {
  if (value == null) {
    await prisma.alert.deleteMany({ where: { memberId, symbol, type, isActive: true } });
    return;
  }
  const existing = await prisma.alert.findFirst({
    where: { memberId, symbol, type, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    await prisma.alert.update({ where: { id: existing.id }, data: { threshold: value } });
    return;
  }
  await prisma.alert.create({ data: { memberId, symbol, type, threshold: value } });
}

// ─── 警報 ───
const ALERT_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW', 'RSI_ABOVE', 'RSI_BELOW'] as const;
type AlertTypeValue = (typeof ALERT_TYPES)[number];

export async function listAlerts(memberId: string): Promise<ApiResult> {
  const rows = await prisma.alert.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
  });
  return ApiResponse.success(rows);
}

export async function addAlert(
  memberId: string,
  symbol: string,
  type: string,
  threshold: number,
): Promise<ApiResult> {
  const sym = (symbol ?? '').trim();
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }
  if (!ALERT_TYPES.includes(type as AlertTypeValue)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      `警報類型錯誤（${ALERT_TYPES.join('/')}）`,
    );
  }
  if (!Number.isFinite(threshold)) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '門檻需為數字');
  }

  const row = await prisma.alert.create({
    data: { memberId, symbol: sym, type: type as AlertTypeValue, threshold },
  });
  return ApiResponse.success(row);
}

export async function removeAlert(memberId: string, id: string): Promise<ApiResult> {
  const row = await prisma.alert.findFirst({ where: { id, memberId } });
  if (!row) {
    return ApiResponse.error(
      ApiReturnCode.NOT_FOUND,
      '找不到警報',
      ApiErrorCode.STOCK.WATCH_NOT_FOUND,
    );
  }
  await prisma.alert.delete({ where: { id } });
  return ApiResponse.success({ id });
}

// ─── K 線（供畫圖）───
export interface KlinePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
}

function sma(values: number[], period: number, idx: number): number | null {
  if (idx + 1 < period) {
    return null;
  }
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    sum += values[i];
  }
  return Math.round((sum / period) * 100) / 100;
}

/** 取日 K（近 days 筆，含 MA + 名稱），供前端畫圖。 */
export async function getKline(
  symbol: string,
  days = 300,
): Promise<ApiResult<{ name: string | null; points: KlinePoint[] }>> {
  const sym = (symbol ?? '').trim();
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }

  const [rows, name] = await Promise.all([
    prisma.stockDailyPrice.findMany({ where: { symbol: sym }, orderBy: { tradeDate: 'asc' } }),
    stockName(sym),
  ]);
  if (!rows.length) {
    return ApiResponse.error(
      ApiReturnCode.NOT_FOUND,
      '尚無此股票的 K 線資料（請先分析）',
      ApiErrorCode.STOCK.NO_PRICE_DATA,
    );
  }

  const closes = rows.map((r) => r.close);
  const points: KlinePoint[] = rows.map((r, i) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: Number(r.volume),
    ma5: sma(closes, 5, i),
    ma20: sma(closes, 20, i),
    ma60: sma(closes, 60, i),
  }));

  return ApiResponse.success({ name, points: points.slice(-days) });
}

/** 單一策略對某檔的「即時訊號」。 */
interface StrategySignalSummary {
  /** 最近一次有效訊號方向；全無訊號 → WAIT */
  action: 'BUY' | 'SELL' | 'WAIT';
  /** 最後一根 K 棒即訊號日 */
  freshToday: boolean;
  /** 距今幾根 K 棒（freshToday=0；無訊號=null） */
  barsAgo: number | null;
  /** 該訊號日 YYYY-MM-DD（無訊號=null） */
  signalDate: string | null;
}

/** 單一策略對某檔的回測績效摘要。 */
interface StrategyStatsSummary {
  totalTrades: number;
  winRate: number;
  totalReturnPct: number;
  buyHoldPct: number;
  maxDrawdownPct: number;
  sharpe: number | null;
}

/** 策略分析單列（即時訊號 + 回測績效）。 */
interface StrategyAnalysisRow {
  id: string;
  label: string;
  description: string;
  glossaryKeys: string[];
  current: StrategySignalSummary;
  /** 回測失敗或資料不足時為 null */
  stats: StrategyStatsSummary | null;
}

/** 策略分析整體回應。 */
interface StrategyAnalysisDto {
  name: string | null;
  /** 資料截止日（最後一根 K 棒） */
  dataDate: string;
  /** 回測涵蓋起始日（第一根 K 棒） */
  periodStart: string;
  rows: StrategyAnalysisRow[];
}

/** 由訊號陣列取「最近一次有效訊號」摘要（由尾端往前找第一個非 null）。 */
function summarizeLatestSignal(
  signals: (DaySignal | null)[],
  klines: StockOhlcv[],
): StrategySignalSummary {
  const lastIndex = klines.length - 1;
  for (let i = lastIndex; i >= 0; i--) {
    const sig = signals[i];
    if (sig) {
      return {
        action: sig === 'buy' ? 'BUY' : 'SELL',
        freshToday: i === lastIndex,
        barsAgo: lastIndex - i,
        signalDate: klines[i].date,
      };
    }
  }
  return { action: 'WAIT', freshToday: false, barsAgo: null, signalDate: null };
}

/**
 * 多策略分析：對 5 個內建技術策略同步計算「即時訊號 + 回測績效」。
 * 引擎為 common 純函式，整段序列僅數百根 K 棒，故同步 in-process 執行、不走佇列。
 */
export async function getStrategyAnalysis(symbol: string): Promise<ApiResult<StrategyAnalysisDto>> {
  const sym = (symbol ?? '').trim();
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }

  const [rows, name] = await Promise.all([
    prisma.stockDailyPrice.findMany({ where: { symbol: sym }, orderBy: { tradeDate: 'asc' } }),
    stockName(sym),
  ]);
  if (!rows.length) {
    return ApiResponse.error(
      ApiReturnCode.NOT_FOUND,
      '尚無此股票的 K 線資料（請先分析）',
      ApiErrorCode.STOCK.NO_PRICE_DATA,
    );
  }

  const klines: StockOhlcv[] = rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: Number(r.volume),
  }));

  const analysisRows: StrategyAnalysisRow[] = listStrategyMeta().map((meta) => {
    const strat = getBacktestStrategy(meta.id);
    const sp = clampParams(meta, meta.defaultParams);
    const current: StrategySignalSummary = strat
      ? summarizeLatestSignal(strat.generateSignals(klines, sp), klines)
      : { action: 'WAIT', freshToday: false, barsAgo: null, signalDate: null };

    let stats: StrategyStatsSummary | null = null;
    try {
      const { stats: s } = runStrategyBacktest(klines, meta.id, { ...DEFAULT_COMMON_PARAMS, ...sp });
      stats = {
        totalTrades: s.totalTrades,
        winRate: s.winRate,
        totalReturnPct: s.totalReturnPct,
        buyHoldPct: s.buyHoldPct,
        maxDrawdownPct: s.maxDrawdownPct,
        sharpe: s.sharpe,
      };
    } catch (e) {
      console.error(`[StockService.getStrategyAnalysis] symbol=${sym} strategy=${meta.id}`, e);
    }

    return {
      id: meta.id,
      label: meta.label,
      description: meta.description,
      glossaryKeys: meta.glossaryKeys,
      current,
      stats,
    };
  });

  return ApiResponse.success({
    name,
    dataDate: klines[klines.length - 1].date,
    periodStart: klines[0].date,
    rows: analysisRows,
  });
}

/** 籌碼（融資券 + 外資持股，近 days 日 + 摘要）。 */
export async function getChips(symbol: string, days = 30): Promise<ApiResult> {
  const sym = (symbol ?? '').trim();
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }

  const rows = await prisma.stockChip.findMany({
    where: { symbol: sym },
    orderBy: { tradeDate: 'asc' },
    take: 90,
  });
  if (!rows.length) {
    return ApiResponse.error(
      ApiReturnCode.NOT_FOUND,
      '尚無籌碼資料（請先分析）',
      ApiErrorCode.STOCK.NO_PRICE_DATA,
    );
  }

  const recent = rows.slice(-days).map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    marginBalance: r.marginBalance,
    shortBalance: r.shortBalance,
    foreignRatio: r.foreignRatio,
  }));
  const last = recent[recent.length - 1];
  const prev5 = recent[Math.max(0, recent.length - 6)];
  const summary = {
    marginBalance: last.marginBalance,
    marginChange5: last.marginBalance - prev5.marginBalance,
    shortBalance: last.shortBalance,
    foreignRatio: last.foreignRatio,
    foreignRatioChange5:
      last.foreignRatio != null && prev5.foreignRatio != null
        ? Math.round((last.foreignRatio - prev5.foreignRatio) * 100) / 100
        : null,
    date: last.date,
  };
  return ApiResponse.success({ recent, summary });
}

/**
 * 基本面 + 最新多因子評分。
 * @param strategy 評分策略 id 或自訂權重；read-time 依此加權算 total 與各因子權重。
 */
export async function getFundamental(
  symbol: string,
  strategy: ScoringStrategyId | StrategyWeights = 'balanced',
): Promise<ApiResult> {
  const sym = (symbol ?? '').trim();
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }

  const [fund, latestSignal] = await Promise.all([
    prisma.stockFundamental.findUnique({ where: { symbol: sym } }),
    prisma.analysisSignal.findFirst({ where: { symbol: sym }, orderBy: { createdAt: 'desc' } }),
  ]);
  if (!fund && !latestSignal?.score) {
    return ApiResponse.error(
      ApiReturnCode.NOT_FOUND,
      '尚無基本面資料（請先分析）',
      ApiErrorCode.STOCK.NO_PRICE_DATA,
    );
  }

  // read-time 套策略加權：把落庫的原始因子（scoreDetail）依所選策略算 total 與各因子權重。
  const weighted = latestSignal?.scoreDetail
    ? applyStrategy(latestSignal.scoreDetail, strategy)
    : null;

  return ApiResponse.success({
    fundamental: fund
      ? {
          revenuePeriod: fund.revenuePeriod,
          revenue: fund.revenue != null ? Number(fund.revenue) : null,
          revenueYoy: fund.revenueYoy,
          revenueMom: fund.revenueMom,
          eps: fund.eps,
          per: fund.per,
          pbr: fund.pbr,
          dividendYield: fund.dividendYield,
        }
      : null,
    // 總分改採 read-time 加權結果；無 scoreDetail 時退回落庫的預設總分。
    score: weighted?.total ?? latestSignal?.score ?? null,
    strategyId: weighted?.strategyId ?? null,
    // 加權後的因子（含 weight / weighted），供前端因子卡顯示；無則回原始 scoreDetail。
    factors: weighted?.factors ?? null,
    scoreDetail: latestSignal?.scoreDetail ?? null,
    // 最新一筆訊號的技術指標（趨勢動能 grid 用）。
    indicators: latestSignal?.indicators ?? null,
    // 三大法人連續買賣超天數（籌碼 tab 用）。
    institutionalStreak: latestSignal?.institutionalStreak ?? null,
    // 評分的「資料日期」＝該訊號產生日（取自既有 analysisSignal.createdAt）。
    scoreDate: latestSignal?.createdAt ? latestSignal.createdAt.toISOString().slice(0, 10) : null,
  });
}

/** 估值河流帶（PER / PBR / 殖利率）+ 今日估值位階。 */
export async function getValuation(
  symbol: string,
  metric: ValuationMetric = 'PER',
): Promise<ApiResult> {
  const sym = (symbol ?? '').trim();
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }
  const rows = await prisma.stockValuationDaily.findMany({
    where: { symbol: sym },
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, per: true, pbr: true, dividendYield: true },
  });
  if (!rows.length) {
    return ApiResponse.error(
      ApiReturnCode.NOT_FOUND,
      '尚無估值資料（請先分析）',
      ApiErrorCode.STOCK.NO_PRICE_DATA,
    );
  }
  const points: ValuationPoint[] = rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    per: r.per,
    pbr: r.pbr,
    dividendYield: r.dividendYield,
  }));
  const bands = computeRiverBands(points, metric);
  const zone = valuationZone(bands.series, metric);
  return ApiResponse.success({ bands, zone, metric, asOf: points[points.length - 1].date });
}

// ─── 選股器 / 飆股雷達 ───

interface ScoreFactorRow {
  key?: string;
  name?: string;
  score: number;
}

/** 從 scoreDetail 取某因子的原始子分數（優先用穩定 key，相容舊資料的中文 name）。 */
function factorScore(scoreDetail: unknown, key: string, legacyName: string): number | null {
  if (!scoreDetail || typeof scoreDetail !== 'object') {
    return null;
  }
  const factors = (scoreDetail as { factors?: ScoreFactorRow[] }).factors;
  return factors?.find((f) => f.key === key || f.name === legacyName)?.score ?? null;
}

/**
 * 選股器：對「有評分的個股」套篩選策略 + 依 read-time 加權評分排行。
 * @param strategy 篩選策略：all | momentum(飆股雷達) | value(低估值) | chips(籌碼強)
 * @param scoring 評分策略 id 或自訂權重；決定 read-time 加權總分與排序
 */
export async function getScreener(
  strategy = 'all',
  limit = 30,
  scoring: ScoringStrategyId | StrategyWeights = 'balanced',
): Promise<ApiResult> {
  const signals = await prisma.analysisSignal.findMany({
    where: { score: { not: null } },
    orderBy: [{ symbol: 'asc' }, { createdAt: 'desc' }],
    distinct: ['symbol'],
  });
  // 整體資料日期＝所有入選訊號中最新的產生日（各列為該代號最新一筆）。
  const asOf =
    signals.length > 0
      ? signals
          .map((s) => s.createdAt)
          .reduce((a, b) => (a > b ? a : b))
          .toISOString()
          .slice(0, 10)
      : null;
  const symbols = signals.map((s) => s.symbol);
  const [funds, names, prices] = await Promise.all([
    prisma.stockFundamental.findMany({ where: { symbol: { in: symbols } } }),
    nameMap(symbols),
    priceMap(symbols),
  ]);
  const fundBySym = new Map(funds.map((f) => [f.symbol, f]));

  const allRows: ScreenRow[] = signals.map((s) => {
    const f = fundBySym.get(s.symbol);
    const ind = (s.indicators ?? {}) as Partial<StockIndicators>;
    const ma5 = ind.ma5 ?? null;
    const ma20 = ind.ma20 ?? null;
    const ma60 = ind.ma60 ?? null;
    const maBullish =
      ma5 != null && ma20 != null && ma60 != null ? ma5 > ma20 && ma20 > ma60 : null;
    const per = f?.per ?? null;
    const revenueYoy = f?.revenueYoy ?? null;
    const peg =
      per != null && per > 0 && revenueYoy != null && revenueYoy > 0
        ? Math.round((per / revenueYoy) * 100) / 100
        : null;
    // read-time 依所選評分策略重算總分；無 scoreDetail 時退回落庫 score。
    const score = s.scoreDetail ? applyStrategy(s.scoreDetail, scoring).total : (s.score ?? 0);
    return {
      symbol: s.symbol,
      name: names.get(s.symbol) ?? null,
      score,
      action: s.action,
      per,
      pbr: f?.pbr ?? null,
      revenueYoy,
      revenueMom: f?.revenueMom ?? null,
      dividendYield: f?.dividendYield ?? null,
      eps: f?.eps ?? null,
      chipScore: factorScore(s.scoreDetail, 'chips', '籌碼面'),
      rationale: s.rationale,
      institutionalStreak: s.institutionalStreak ?? null,
      valuationZone: s.valuationZone ?? null,
      ma120: ind.ma120 ?? null,
      ma240: ind.ma240 ?? null,
      close: prices.get(s.symbol)?.close ?? null,
      volumeRatio: ind.volumeRatio ?? null,
      maBullish,
      peg,
    };
  });

  const strat = getStrategy(strategy);
  const rows = allRows.filter(strat.predicate).sort(strat.sort ?? ((a, b) => b.score - a.score));
  return ApiResponse.success({
    rows: rows.slice(0, Math.min(limit, 100)),
    asOf,
    strategy: strat.key,
  });
}

/** 觸發股池掃描。 */
export async function triggerScreen(): Promise<ApiResult<{ jobId: string }>> {
  try {
    const jobId = await enqueueScreen();
    return ApiResponse.success({ jobId });
  } catch (e) {
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, `掃描入列失敗：${(e as Error).message}`);
  }
}

// ─── 大盤 / 類股輪動 ───

interface SectorChange {
  name: string;
  changePct: number;
}

/** 最新大盤快照（加權指數 + 漲跌家數 + 類股強弱）。 */
export async function getMarket(): Promise<ApiResult> {
  try {
    const row = await prisma.marketDaily.findFirst({ orderBy: { date: 'desc' } });
    if (!row) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        '尚無大盤資料（請先更新大盤）',
        ApiErrorCode.STOCK.NO_PRICE_DATA,
      );
    }

    const sectors = Array.isArray(row.sectors) ? (row.sectors as unknown as SectorChange[]) : [];
    return ApiResponse.success({
      date: row.date.toISOString().slice(0, 10),
      taiex: {
        open: row.taiexOpen,
        high: row.taiexHigh,
        low: row.taiexLow,
        close: row.taiexClose,
        changePct: row.taiexChangePct,
      },
      breadth: {
        advancers: row.advancers ?? 0,
        decliners: row.decliners ?? 0,
        unchanged: row.unchanged ?? 0,
      },
      sectors,
    });
  } catch (e) {
    console.error('[StockService.getMarket]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '大盤資料讀取失敗，請稍後再試');
  }
}

/** 觸發大盤更新。 */
export async function triggerMarket(): Promise<ApiResult<{ jobId: string }>> {
  try {
    const jobId = await enqueueMarket();
    return ApiResponse.success({ jobId });
  } catch (e) {
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      `大盤更新入列失敗：${(e as Error).message}`,
    );
  }
}

// ─── 國際盤 / 期貨夜盤 ───

/** 最新國際盤快照（美股四大指數 + 台指期夜盤 + 三大法人未平倉）。 */
export async function getGlobalMarket(): Promise<ApiResult> {
  try {
    const row = await prisma.globalMarketDaily.findFirst({ orderBy: { date: 'desc' } });
    if (!row) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        '尚無國際盤資料（請先更新國際盤）',
        ApiErrorCode.STOCK.NO_PRICE_DATA,
      );
    }

    const usIndices = Array.isArray(row.usIndices)
      ? (row.usIndices as unknown as UsIndexQuote[])
      : [];
    const futChips =
      row.futChips && typeof row.futChips === 'object' && !Array.isArray(row.futChips)
        ? (row.futChips as unknown as FuturesChip)
        : null;

    return ApiResponse.success({
      date: row.date.toISOString().slice(0, 10),
      usIndices,
      txfNight: {
        close: row.txfNightClose,
        changePct: row.txfNightChangePct,
        changePoint: row.txfNightChangePoint,
        basis: row.txfBasis,
      },
      futChips,
    });
  } catch (e) {
    console.error('[StockService.getGlobalMarket]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '國際盤資料讀取失敗，請稍後再試');
  }
}

/** 觸發國際盤 / 期貨夜盤更新。 */
export async function triggerGlobalMarket(): Promise<ApiResult<{ jobId: string }>> {
  try {
    const jobId = await enqueueGlobal();
    return ApiResponse.success({ jobId });
  } catch (e) {
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      `國際盤更新入列失敗：${(e as Error).message}`,
    );
  }
}

// ─── 大盤 AI 盤勢解讀報告 ───

/** 將 DB 列轉成 MarketReportDto（reportDate → YYYY-MM-DD）。 */
function toMarketReportDto(row: {
  reportDate: Date;
  title: string;
  summary: string;
  body: string;
  sentiment: string | null;
  degraded: boolean;
}): MarketReportDto {
  const sentiment =
    row.sentiment === 'bullish' || row.sentiment === 'neutral' || row.sentiment === 'bearish'
      ? row.sentiment
      : undefined;
  return {
    reportDate: row.reportDate.toISOString().slice(0, 10),
    title: row.title,
    summary: row.summary,
    body: row.body,
    sentiment,
    degraded: row.degraded,
  };
}

/** 取最新一篇大盤 AI 盤勢解讀（無則回 null）。 */
export async function getMarketReport(): Promise<ApiResult<MarketReportDto | null>> {
  try {
    const row = await prisma.marketReport.findFirst({ orderBy: { reportDate: 'desc' } });
    return ApiResponse.success(row ? toMarketReportDto(row) : null);
  } catch (e) {
    console.error('[StockService.getMarketReport]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '盤勢報告讀取失敗，請稍後再試');
  }
}

/** 觸發大盤 AI 盤勢解讀（強制重跑當日）。 */
export async function triggerMarketReport(): Promise<ApiResult<{ jobId: string }>> {
  try {
    const jobId = await enqueueMarketReport(true);
    return ApiResponse.success({ jobId });
  } catch (e) {
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      `盤勢報告入列失敗：${(e as Error).message}`,
    );
  }
}

/** 查訊號（含名稱） */
export async function listSignals(symbol?: string, limit = 50): Promise<ApiResult> {
  const rows = await prisma.analysisSignal.findMany({
    where: symbol ? { symbol } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
  const names = await nameMap(Array.from(new Set(rows.map((r) => r.symbol))));
  return ApiResponse.success(rows.map((r) => ({ ...r, name: names.get(r.symbol) ?? null })));
}

/** 查報告 */
export async function listReports(symbol?: string, limit = 30): Promise<ApiResult> {
  const rows = await prisma.researchReport.findMany({
    where: symbol ? { symbol } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });
  return ApiResponse.success(rows);
}

/** 入列分析 */
export async function triggerAnalysis(symbol: string): Promise<ApiResult<{ jobId: string }>> {
  const guard = await ensureTradableSymbol(symbol.trim());
  if (guard) {
    return guard;
  }
  try {
    const jobId = await enqueueAnalysis(symbol.trim(), 'manual', true);
    return ApiResponse.success({ jobId });
  } catch (e) {
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      `入列失敗：${(e as Error).message}`,
      ApiErrorCode.STOCK.AGENT_FAILED,
    );
  }
}

/** 入列研究 */
export async function triggerResearch(symbol: string): Promise<ApiResult<{ jobId: string }>> {
  const guard = await ensureTradableSymbol(symbol.trim());
  if (guard) {
    return guard;
  }
  try {
    const jobId = await enqueueResearch(symbol.trim(), 'manual', true);
    return ApiResponse.success({ jobId });
  } catch (e) {
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      `入列失敗：${(e as Error).message}`,
      ApiErrorCode.STOCK.AGENT_FAILED,
    );
  }
}

// ─── 多策略回測 ───

/** 共用回測參數（與策略無關）。 */
interface CommonInput {
  initialCapital?: number;
  feeRate?: number;
  taxRate?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
}

/** 單筆回測請求輸入（全部選填，未填用預設）。 */
export interface BacktestInput extends CommonInput {
  symbol: string;
  startDate?: string;
  endDate?: string;
  /** 策略 id（預設 kd） */
  strategy?: string;
  /** 策略專屬參數（依策略不同；未填用該策略預設） */
  params?: Record<string, number>;
}

/** 比較頁中的單一策略項目。 */
export interface ComparisonEntryInput {
  strategyId: string;
  params?: Record<string, number>;
}

/** 策略比較請求輸入。 */
export interface ComparisonInput extends CommonInput {
  symbol: string;
  startDate?: string;
  endDate?: string;
  entries?: ComparisonEntryInput[];
  /** 發起者 member id（稽核用） */
  createdById?: string;
}

/** 比較最多策略數（受色盤與單批運算量約束）。 */
const MAX_COMPARISON_ENTRIES = 8;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 預設回測年數。 */
const DEFAULT_BACKTEST_YEARS = 5;

/** 取台北時區今日 YYYY-MM-DD。 */
function taipeiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

/** N 年前的 YYYY-MM-DD（以今日台北日期為基準）。 */
function yearsAgo(years: number): string {
  const d = new Date(`${taipeiToday()}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** 夾擠數值至 [min, max]；非有限值回 fallback。 */
function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(Math.max(n, min), max);
}

/** 將共用輸入正規化為扁平共用參數（夾擠 + 套預設）。 */
function normalizeCommonParams(input: CommonInput): Record<string, number> {
  return {
    initialCapital: clampNum(input.initialCapital, 10_000, 1_000_000_000, 1_000_000),
    feeRate: clampNum(input.feeRate, 0, 0.01, 0.001425),
    taxRate: clampNum(input.taxRate, 0, 0.01, 0.003),
    stopLossPct: clampNum(input.stopLossPct, 0, 90, 0),
    takeProfitPct: clampNum(input.takeProfitPct, 0, 1000, 0),
  };
}

/**
 * 依策略註冊表夾擠策略專屬參數並做跨欄位驗證。
 * @returns 夾擠後參數，或 { error } 驗證錯誤訊息
 */
function normalizeStrategyParams(
  strategyId: string,
  raw: Record<string, number> | undefined,
): { params: Record<string, number> } | { error: string } {
  const strat = getBacktestStrategy(strategyId);
  if (!strat) {
    return { error: `未知的回測策略：${strategyId}` };
  }
  const params = clampParams(strat, raw ?? {});
  const vErr = strat.validate(params);
  if (vErr) {
    return { error: `${strat.label}：${vErr}` };
  }
  return { params };
}

/** 解析並驗證日期區間（回錯誤字串或 { startDate, endDate }）。 */
function resolveDateRange(
  input: { startDate?: string; endDate?: string },
): { startDate: string; endDate: string } | { error: string } {
  const endDate = input.endDate && DATE_RE.test(input.endDate) ? input.endDate : taipeiToday();
  const startDate =
    input.startDate && DATE_RE.test(input.startDate)
      ? input.startDate
      : yearsAgo(DEFAULT_BACKTEST_YEARS);
  if (startDate >= endDate) {
    return { error: '起日必須早於迄日' };
  }
  return { startDate, endDate };
}

/** 啟動一次回測：驗證 → 建 BacktestRun(pending) → 入列 worker → 回 runId。 */
export async function runBacktest(input: BacktestInput): Promise<ApiResult<{ runId: string }>> {
  const sym = (input.symbol ?? '').trim();
  const guard = await ensureTradableSymbol(sym);
  if (guard) {
    return guard;
  }
  const range = resolveDateRange(input);
  if ('error' in range) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, range.error);
  }
  const strategyId = input.strategy ?? 'kd';
  const sp = normalizeStrategyParams(strategyId, input.params);
  if ('error' in sp) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, sp.error);
  }
  // 扁平合併：共用 + 策略專屬（與 worker / common 讀取格式一致，亦相容舊 KD 列）
  const params = { ...normalizeCommonParams(input), ...sp.params };
  try {
    const run = await prisma.backtestRun.create({
      data: {
        symbol: sym,
        strategy: strategyId,
        params: params as object,
        startDate: new Date(`${range.startDate}T00:00:00Z`),
        endDate: new Date(`${range.endDate}T00:00:00Z`),
        status: 'pending',
      },
    });
    await enqueueBacktest({ runId: run.id, symbol: sym, ...range, strategy: strategyId, params });
    return ApiResponse.success({ runId: run.id });
  } catch (e) {
    console.error(`[StockService.runBacktest] symbol=${sym}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '回測入列失敗，請稍後再試');
  }
}

/** 為比較項目產生顯示標籤：同策略多筆時附加區別後綴，並確保唯一。 */
function resolveLabels(
  entries: { strategyId: string; params: Record<string, number> }[],
): string[] {
  const total: Record<string, number> = {};
  for (const e of entries) {
    total[e.strategyId] = (total[e.strategyId] ?? 0) + 1;
  }
  const base = entries.map((e) => {
    const strat = getBacktestStrategy(e.strategyId);
    const name = strat?.label ?? e.strategyId;
    if ((total[e.strategyId] ?? 0) <= 1) {
      return name;
    }
    const sig = Object.values(e.params).join('/');
    return sig ? `${name} (${sig})` : name;
  });
  // 確保唯一（完全相同者附加序號）
  const seen: Record<string, number> = {};
  return base.map((label) => {
    seen[label] = (seen[label] ?? 0) + 1;
    return seen[label] > 1 ? `${label} #${seen[label]}` : label;
  });
}

/** 啟動一次策略比較：驗證 → 建 BacktestBatch + 子 BacktestRun(pending) → 入列 batch job → 回 batchId。 */
export async function runComparison(
  input: ComparisonInput,
): Promise<ApiResult<{ batchId: string }>> {
  const sym = (input.symbol ?? '').trim();
  const guard = await ensureTradableSymbol(sym);
  if (guard) {
    return guard;
  }
  const range = resolveDateRange(input);
  if ('error' in range) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, range.error);
  }
  const rawEntries = input.entries ?? [];
  if (rawEntries.length < 2) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '至少需選擇 2 個策略才能比較');
  }
  if (rawEntries.length > MAX_COMPARISON_ENTRIES) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      `最多只能比較 ${MAX_COMPARISON_ENTRIES} 個策略`,
    );
  }
  // 逐項夾擠 + 驗證
  const normalized: { strategyId: string; params: Record<string, number> }[] = [];
  for (const e of rawEntries) {
    const sp = normalizeStrategyParams(e.strategyId, e.params);
    if ('error' in sp) {
      return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, sp.error);
    }
    normalized.push({ strategyId: e.strategyId, params: sp.params });
  }
  const labels = resolveLabels(normalized);
  const common = normalizeCommonParams(input);

  try {
    const batch = await prisma.backtestBatch.create({
      data: {
        symbol: sym,
        startDate: new Date(`${range.startDate}T00:00:00Z`),
        endDate: new Date(`${range.endDate}T00:00:00Z`),
        common: common as object,
        entries: [] as object, // 先佔位，建子列取得 runId 後補上
        status: 'pending',
        createdById: input.createdById ?? null,
      },
    });

    // 建子 BacktestRun（pending），收集 runId
    const entries: ComparisonEntry[] = [];
    for (let i = 0; i < normalized.length; i++) {
      const n = normalized[i];
      const merged = { ...common, ...n.params };
      const child = await prisma.backtestRun.create({
        data: {
          symbol: sym,
          strategy: n.strategyId,
          params: merged as object,
          startDate: new Date(`${range.startDate}T00:00:00Z`),
          endDate: new Date(`${range.endDate}T00:00:00Z`),
          status: 'pending',
          batchId: batch.id,
        },
      });
      entries.push({ runId: child.id, strategyId: n.strategyId, params: n.params, label: labels[i] });
    }

    await prisma.backtestBatch.update({
      where: { id: batch.id },
      data: { entries: entries as object },
    });
    await enqueueComparison({ batchId: batch.id, symbol: sym, ...range, common, entries });
    return ApiResponse.success({ batchId: batch.id });
  } catch (e) {
    console.error(`[StockService.runComparison] symbol=${sym}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '策略比較入列失敗，請稍後再試');
  }
}

/** 取單一回測結果（前端輪詢用）。 */
export async function getBacktestResult(runId: string): Promise<ApiResult> {
  const id = (runId ?? '').trim();
  if (!id) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '缺少 runId');
  }
  const row = await prisma.backtestRun.findUnique({ where: { id } });
  if (!row) {
    return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到該筆回測紀錄');
  }
  const name = await stockName(row.symbol);
  return ApiResponse.success({ ...row, name });
}

/** 回測歷史列表（可依代號篩選；排除比較子列；不含大型 JSON 欄位以利列表載入）。 */
export async function listBacktestRuns(symbol?: string, limit = 30): Promise<ApiResult> {
  const sym = symbol?.trim();
  const rows = await prisma.backtestRun.findMany({
    where: { batchId: null, ...(sym ? { symbol: sym } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    select: {
      id: true,
      symbol: true,
      strategy: true,
      status: true,
      startDate: true,
      endDate: true,
      totalReturnPct: true,
      annualizedPct: true,
      winRate: true,
      totalTrades: true,
      maxDrawdownPct: true,
      createdAt: true,
    },
  });
  const names = await nameMap(rows.map((r) => r.symbol));
  return ApiResponse.success(rows.map((r) => ({ ...r, name: names.get(r.symbol) ?? null })));
}

/** 比較批次儲存的 entry 形狀。 */
interface StoredEntry {
  runId: string;
  strategyId: string;
  params: Record<string, number>;
  label: string;
}

/** 取單一比較結果（前端輪詢用，含各子回測；防禦式推導狀態）。 */
export async function getComparison(batchId: string): Promise<ApiResult<ComparisonResult>> {
  const id = (batchId ?? '').trim();
  if (!id) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '缺少 batchId');
  }
  const batch = await prisma.backtestBatch.findUnique({ where: { id }, include: { runs: true } });
  if (!batch) {
    return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到該比較批次');
  }
  const name = await stockName(batch.symbol);
  const entries = (Array.isArray(batch.entries) ? batch.entries : []) as unknown as StoredEntry[];
  const runMap = new Map(batch.runs.map((r) => [r.id, r]));
  const rows: ComparisonRow[] = entries.map((e) => {
    const run = runMap.get(e.runId);
    return {
      runId: e.runId,
      strategyId: e.strategyId,
      label: e.label,
      params: e.params,
      status: run?.status ?? 'pending',
      error: run?.error ?? null,
      stats: run?.stats ? (run.stats as unknown as BacktestStats) : null,
      equityCurve: run?.equityCurve ? (run.equityCurve as unknown as BacktestEquityPoint[]) : null,
    };
  });
  // 防禦式狀態：父非終態但所有子皆終態時，由子推導（避免 worker 崩潰後永卡 running）
  let status = batch.status;
  if (status !== 'done' && status !== 'partial' && status !== 'failed' && rows.length > 0) {
    const terminal = rows.every((r) => r.status === 'done' || r.status === 'failed');
    if (terminal) {
      const ok = rows.filter((r) => r.status === 'done').length;
      status = ok === rows.length ? 'done' : ok === 0 ? 'failed' : 'partial';
    }
  }
  const result: ComparisonResult = {
    batchId: batch.id,
    symbol: batch.symbol,
    name,
    status,
    startDate: batch.startDate.toISOString().slice(0, 10),
    endDate: batch.endDate.toISOString().slice(0, 10),
    globalStartDate: batch.globalStartDate,
    buyHoldPct: batch.buyHoldPct,
    buyHoldCurve: batch.buyHoldCurve
      ? (batch.buyHoldCurve as unknown as BacktestEquityPoint[])
      : null,
    championRunId: batch.championRunId,
    common: parseCommonParams(batch.common),
    rows,
  };
  return ApiResponse.success(result);
}

/** 比較批次歷史列表（可依代號篩選）。 */
export async function listBacktestBatches(symbol?: string, limit = 30): Promise<ApiResult> {
  const sym = symbol?.trim();
  const rows = await prisma.backtestBatch.findMany({
    where: sym ? { symbol: sym } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    select: {
      id: true,
      symbol: true,
      status: true,
      startDate: true,
      endDate: true,
      entries: true,
      buyHoldPct: true,
      championRunId: true,
      createdAt: true,
    },
  });
  const names = await nameMap(rows.map((r) => r.symbol));
  const out = rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: names.get(r.symbol) ?? null,
    status: r.status,
    startDate: r.startDate,
    endDate: r.endDate,
    strategyCount: Array.isArray(r.entries) ? r.entries.length : 0,
    buyHoldPct: r.buyHoldPct,
    createdAt: r.createdAt,
  }));
  return ApiResponse.success(out);
}

/** 刪除比較批次（子回測經外鍵 onDelete: Cascade 一併刪除）。 */
export async function deleteComparison(batchId: string): Promise<ApiResult<{ id: string }>> {
  const id = (batchId ?? '').trim();
  if (!id) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '缺少 batchId');
  }
  try {
    await prisma.backtestBatch.delete({ where: { id } });
    return ApiResponse.success({ id });
  } catch (e) {
    console.error(`[StockService.deleteComparison] id=${id}`, e);
    return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到或無法刪除該比較批次');
  }
}

/** 刪除單筆回測紀錄。 */
export async function deleteBacktestRun(runId: string): Promise<ApiResult<{ id: string }>> {
  const id = (runId ?? '').trim();
  if (!id) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '缺少 runId');
  }
  try {
    await prisma.backtestRun.delete({ where: { id } });
    return ApiResponse.success({ id });
  } catch (e) {
    // Prisma P2025 = 找不到該筆紀錄
    if ((e as { code?: string }).code === 'P2025') {
      return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到該筆回測紀錄');
    }
    console.error(`[StockService.deleteBacktestRun] id=${id}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除失敗，請稍後再試');
  }
}

/** 清除回測歷史（可選依代號；不帶代號＝全部）。 */
export async function deleteAllBacktestRuns(symbol?: string): Promise<ApiResult<{ count: number }>> {
  try {
    const sym = symbol?.trim();
    const res = await prisma.backtestRun.deleteMany({ where: sym ? { symbol: sym } : undefined });
    return ApiResponse.success({ count: res.count });
  } catch (e) {
    console.error('[StockService.deleteAllBacktestRuns]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '清除失敗，請稍後再試');
  }
}

/**
 * 指令路由（後台 console / LINE 共用）。
 * 支援：/watch <代號>、/signal <代號>、/report <代號>、/gainers、/help
 */
export async function runCommand(
  memberId: string,
  text: string,
): Promise<ApiResult<{ reply: string }>> {
  const raw = (text ?? '').trim();
  const [cmdRaw, arg] = raw.split(/\s+/, 2);
  const cmd = cmdRaw?.toLowerCase();

  try {
    switch (cmd) {
      case '/watch': {
        if (!arg) {
          return ApiResponse.success({ reply: '用法：/watch 2330' });
        }
        const res = await addWatch(memberId, arg);
        if (!res.success) {
          return ApiResponse.success({ reply: `❌ ${res.message}` });
        }
        await enqueueAnalysis(arg, 'command').catch((e) =>
          console.error('[stockService.runCommand] enqueueAnalysis 失敗', e),
        );
        await enqueueResearch(arg, 'command').catch((e) =>
          console.error('[stockService.runCommand] enqueueResearch 失敗', e),
        );
        return ApiResponse.success({
          reply: `✅ 已加入關注 ${arg}，並已排入分析與研究。`,
        });
      }
      case '/signal': {
        if (!arg) {
          return ApiResponse.success({ reply: '用法：/signal 2330' });
        }
        const latest = await prisma.analysisSignal.findFirst({
          where: { symbol: arg },
          orderBy: { createdAt: 'desc' },
        });
        await enqueueAnalysis(arg, 'command').catch((e) =>
          console.error('[stockService.runCommand] enqueueAnalysis 失敗', e),
        );
        if (!latest) {
          return ApiResponse.success({
            reply: `已排入 ${arg} 分析，稍後再查詢即可看到訊號。`,
          });
        }
        const scoreText = latest.score != null ? `；綜合評分 ${latest.score}/100` : '';
        let plan = '';
        if (latest.entryZone) {
          plan =
            `參考進場 ${latest.entryZone}` +
            (latest.stopLoss != null ? `、停損 ${latest.stopLoss}` : '') +
            (latest.takeProfit != null ? `、停利 ${latest.takeProfit}` : '');
        }
        const replyLines = [
          `📊 ${arg} 最新訊號：${latest.action}（信心 ${latest.confidence}${scoreText}）`,
          `💡 白話結論：${plainVerdict(latest.action, latest.confidence, latest.score)}`,
          latest.rationale ?? '',
          plan,
          '（已重新排入最新分析）',
        ].filter(Boolean);
        return ApiResponse.success({ reply: replyLines.join('\n') });
      }
      case '/report': {
        if (!arg) {
          return ApiResponse.success({ reply: '用法：/report 2330' });
        }
        const latest = await prisma.researchReport.findFirst({
          where: { symbol: arg },
          orderBy: { createdAt: 'desc' },
        });
        await enqueueResearch(arg, 'command').catch((e) =>
          console.error('[stockService.runCommand] enqueueResearch 失敗', e),
        );
        if (!latest) {
          return ApiResponse.success({
            reply: `已排入 ${arg} 研究報告，稍後再查詢。`,
          });
        }
        return ApiResponse.success({
          reply: `📄 ${latest.title}\n${latest.summary}\n（已重新排入最新研究）`,
        });
      }
      case '/gainers': {
        await enqueueDigest().catch((e) =>
          console.error('[stockService.runCommand] enqueueDigest 失敗', e),
        );
        const latest = await prisma.researchReport.findFirst({
          where: { symbol: 'GAINERS' },
          orderBy: { createdAt: 'desc' },
        });
        return ApiResponse.success({
          reply: latest
            ? `📈 ${latest.title}\n${latest.summary}\n（已重新排入最新摘要）`
            : '已排入漲幅摘要，稍後查詢。',
        });
      }
      case '/help':
        return ApiResponse.success({
          reply:
            '可用指令：\n/watch 2330　加入關注\n/signal 2330　查買賣訊號\n/report 2330　查研究報告\n/gainers　今日漲幅解讀\n' +
            '或直接用白話問，例如「2330 現在可以買嗎？為什麼？」',
        });
      default: {
        // 非指令 → 自然語言問答（Claude）
        if (!raw) {
          return ApiResponse.success({
            reply: '請輸入問題或指令（/help 看用法）。',
          });
        }
        const answer = await askQuestion(raw);
        return ApiResponse.success({ reply: answer });
      }
    }
  } catch (e) {
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      (e as Error).message,
      ApiErrorCode.STOCK.AGENT_FAILED,
    );
  }
}

// ─── Worker / Job 監控 ───

/** 近期 job（AnalysisRun）+ 各狀態統計。 */
/** 從 job output 萃取人類可讀的「完成了什麼」摘要。 */
function jobSummary(type: string, output: unknown): string {
  if (!output || typeof output !== 'object') {
    return '';
  }
  const o = output as Record<string, unknown>;
  if (type === 'analysis') {
    const action = o.action != null ? String(o.action) : '';
    const conf = o.confidence != null ? `信心 ${o.confidence}` : '';
    const pushed = typeof o.pushedTo === 'number' && o.pushedTo > 0 ? `・推播 ${o.pushedTo}` : '';
    return `${action} ${conf}${pushed}`.trim();
  }
  if (type === 'screen') {
    return `派發 ${o.dispatched ?? '?'} 檔`;
  }
  if (type === 'digest') {
    return `漲幅榜 ${o.count ?? o.topN ?? '?'} 檔`;
  }
  if (type === 'research') {
    return o.title != null ? String(o.title) : '報告已生成';
  }
  if (type === 'qa') {
    return '已回答';
  }
  if (type === 'backtest') {
    const ret = o.totalReturnPct != null ? `總報酬 ${o.totalReturnPct}%` : '已完成';
    const trades = o.totalTrades != null ? `・${o.totalTrades} 筆交易` : '';
    return `${ret}${trades}`;
  }
  if (type === 'backtest-batch') {
    return `比較 ${o.total ?? '?'} 策略・${o.done ?? 0}/${o.total ?? '?'} 完成（${o.status ?? ''}）`;
  }
  return JSON.stringify(o).slice(0, 60);
}

export async function getJobs(limit = 50, type?: string): Promise<ApiResult> {
  const where = type ? { type } : undefined;
  const [rows, grouped] = await Promise.all([
    prisma.analysisRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    }),
    prisma.analysisRun.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);
  const stats: Record<string, number> = {};
  for (const g of grouped) {
    stats[g.status] = g._count._all;
  }
  const jobs = rows.map((r) => ({ ...r, summary: jobSummary(r.type, r.output) }));
  return ApiResponse.success({ jobs, stats });
}

interface ScheduleView {
  key: string;
  label: string;
  pattern: string;
  hour: number;
  minute: number;
  /** 執行星期（cron DOW，0=週日…6=週六）；滿 7 天表每天。 */
  weekdays: number[];
  enabled: boolean;
  next: number | null;
  tz: string;
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** cron 的 7 視為週日，正規化到 0–6。 */
function normalizeWeekday(d: number): number {
  return d === 7 ? 0 : d;
}

/** 解析 cron 的 DOW 欄位（支援 *、逗號清單、範圍 a-b）為 0–6 陣列。 */
function parseWeekdays(field: string): number[] {
  if (field === '*' || field === '') {
    return [...ALL_WEEKDAYS];
  }
  const out = new Set<number>();
  for (const token of field.split(',')) {
    const range = token.split('-');
    if (range.length === 2) {
      const start = Number(range[0]);
      const end = Number(range[1]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (let d = start; d <= end; d++) {
          out.add(normalizeWeekday(d));
        }
      }
      continue;
    }
    const d = Number(token);
    if (Number.isFinite(d)) {
      out.add(normalizeWeekday(d));
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** 解析 cron「分 時 * * 週」→ 時 / 分 / 星期。 */
function parseCronParts(pattern: string): { hour: number; minute: number; weekdays: number[] } {
  const parts = pattern.trim().split(/\s+/);
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  return {
    hour: Number.isFinite(hour) ? hour : 14,
    minute: Number.isFinite(minute) ? minute : 0,
    weekdays: parseWeekdays(parts[4] ?? '*'),
  };
}

/** 由時 / 分 / 星期組 cron。星期空或滿 7 天 → DOW 用 *（每天）。 */
function buildCronPattern(hour: number, minute: number, weekdays: number[]): string {
  const sorted = Array.from(new Set(weekdays))
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  const dow = sorted.length === 0 || sorted.length === 7 ? '*' : sorted.join(',');
  return `${minute} ${hour} * * ${dow}`;
}

/** 排程清單（registry + DB 覆寫 + BullMQ 下次執行），依 next 升冪。 */
export async function getSchedulesView(): Promise<ScheduleView[]> {
  const [configs, nextRuns] = await Promise.all([
    prisma.scheduleConfig.findMany(),
    getSchedulerNextRuns(),
  ]);
  const cfgByKey = new Map(configs.map((c) => [c.key, c]));

  const views: ScheduleView[] = Object.entries(EDITABLE_SCHEDULES).map(([key, def]) => {
    const cfg = cfgByKey.get(key);
    const pattern = cfg?.pattern ?? def.defaultPattern;
    const { hour, minute, weekdays } = parseCronParts(pattern);
    return {
      key,
      label: def.label,
      pattern,
      hour,
      minute,
      weekdays,
      enabled: cfg?.enabled ?? true,
      next: nextRuns.get(key) ?? null,
      tz: SCHEDULE_TZ,
    };
  });
  return views.sort(
    (a, b) => (a.next ?? Number.MAX_SAFE_INTEGER) - (b.next ?? Number.MAX_SAFE_INTEGER),
  );
}

/** 更新排程時間 / 啟用（落庫 + 即時套用到 BullMQ）。 */
export async function updateSchedule(
  key: string,
  hour: number,
  minute: number,
  weekdays: number[],
  enabled: boolean,
): Promise<ApiResult> {
  if (!(key in EDITABLE_SCHEDULES)) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, `未知排程：${key}`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '小時需為 0–23');
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '分鐘需為 0–59');
  }
  if (!Array.isArray(weekdays) || weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '星期需為 0–6 的整數');
  }
  if (weekdays.length === 0) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '至少需選擇一個星期');
  }
  const pattern = buildCronPattern(hour, minute, weekdays);
  try {
    await prisma.scheduleConfig.upsert({
      where: { key },
      update: { pattern, enabled },
      create: { key, pattern, enabled },
    });
    await applySchedule(key, pattern, enabled);
    return ApiResponse.success({ key, pattern, enabled });
  } catch (e) {
    console.error(`[StockService.updateSchedule] key=${key}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '排程更新失敗，請稍後再試');
  }
}

/** 佇列數量 + worker 心跳 + 排程任務（未來）。 */
export async function getQueuesStatus(): Promise<ApiResult> {
  try {
    const [queues, heartbeat, schedules] = await Promise.all([
      getQueueCounts(),
      getHeartbeat(),
      getSchedulesView(),
    ]);
    return ApiResponse.success({ queues, heartbeat, schedules });
  } catch (e) {
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      `讀取佇列狀態失敗（Redis 未連線？）：${(e as Error).message}`,
    );
  }
}

/** 重跑一個失敗 job（依其 type + symbol 重新入列）。 */
export async function retryJob(id: string): Promise<ApiResult<{ requeued: boolean }>> {
  const run = await prisma.analysisRun.findUnique({ where: { id } });
  if (!run) {
    return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到該 job');
  }
  try {
    const ok = await requeueByType(run.type, run.symbol ?? undefined);
    if (!ok) {
      return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, `此類型不支援重跑：${run.type}`);
    }
    return ApiResponse.success({ requeued: true });
  } catch (e) {
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, `重跑失敗：${(e as Error).message}`);
  }
}

/** 排程 key → 手動立即執行動作（force / 唯一 jobId，繞過當日去重）。 */
const SCHEDULE_RUNNERS: Record<string, () => Promise<string>> = {
  'daily-track': () => enqueueDispatch('manual'),
  'daily-digest': () => enqueueDigest(15, 'manual'),
  'daily-screen': () => enqueueScreen(true),
  'daily-market': () => enqueueMarket(true),
  'daily-global': () => enqueueGlobal(true),
  'daily-market-report': () => enqueueMarketReport(true),
};

/** 手動立即執行某排程（不必等下次 cron；force 確保當日已跑過仍會再跑）。 */
export async function runScheduleNow(key: string): Promise<ApiResult<{ jobId: string }>> {
  const runner = SCHEDULE_RUNNERS[key];
  if (!runner) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, `未知排程：${key}`);
  }
  try {
    const jobId = await runner();
    return ApiResponse.success({ jobId });
  } catch (e) {
    console.error(`[StockService.runScheduleNow] key=${key}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '立即執行失敗，請稍後再試');
  }
}

export interface ScheduleRunRow {
  id: string;
  key: string;
  trigger: string;
  status: string;
  result: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** 查某排程的執行紀錄（依排程 key，最近在前，上限 50 筆）。 */
export async function getScheduleRuns(
  key: string,
  limit = 20,
): Promise<ApiResult<{ runs: ScheduleRunRow[] }>> {
  if (!key) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, 'key 為必填');
  }
  try {
    const rows = await prisma.scheduleRun.findMany({
      where: { key },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    const runs: ScheduleRunRow[] = rows.map((r) => ({
      id: r.id,
      key: r.key,
      trigger: r.trigger,
      status: r.status,
      result: r.result,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    }));
    return ApiResponse.success({ runs });
  } catch (e) {
    console.error(`[StockService.getScheduleRuns] key=${key}`, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '執行紀錄讀取失敗，請稍後再試');
  }
}
