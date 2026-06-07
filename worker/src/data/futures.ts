/**
 * 台指期資料層（FinMind TaiwanFuturesDaily / TaiwanFuturesInstitutionalInvestors，沿用既有 finmindGet）。
 *  - 夜盤：近月（contract_date 6 碼、volume>0 最小者）after_market 最新日；
 *    FinMind 的 spread / spread_per 已是「vs 前一結算」的漲跌，直接採用。
 *  - 三大法人未平倉：外資 / 投信 / 自營商，netOi = 多方未平倉 − 空方未平倉。
 *
 * 注意：after_market 的 open_interest 恆為 0，故未平倉一律取自 InstitutionalInvestors 資料集。
 */
import type { FuturesChip, FuturesInstitutionOi } from '@azeroth/common';
import { finmindGet } from './finmind.js';
import { log } from '../logger.js';

const TXF_ID = 'TX';
const FUTURES_DATASET = {
  DAILY: 'TaiwanFuturesDaily',
  INSTITUTIONAL: 'TaiwanFuturesInstitutionalInvestors',
} as const;
const NIGHT_SESSION = 'after_market';
/** 回看天數（足夠涵蓋連假，確保抓得到最近一個交易日）。 */
const LOOKBACK_DAYS = 12;

interface FuturesDailyRow {
  date: string;
  contract_date: string;
  close: number;
  spread: number;
  spread_per: number;
  volume: number;
  trading_session: string;
}
interface FuturesInstRow {
  date: string;
  institutional_investors: string;
  long_open_interest_balance_volume: number;
  short_open_interest_balance_volume: number;
}

/** 台指期夜盤近月報價。 */
export interface TxfNightQuote {
  /** 夜盤交易日（FinMind 慣例 = 次一交易日）YYYY-MM-DD */
  date: string;
  close: number;
  /** 漲跌點（vs 日盤結算） */
  changePoint: number;
  /** 漲跌%（vs 日盤結算） */
  changePct: number;
}

function startDateStr(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 近月合約：contract_date 為 6 碼純數字（排除「YYYYMM/YYYYMM」價差合約）。 */
function isOutright(contractDate: string): boolean {
  return /^\d{6}$/.test(contractDate);
}

/**
 * 台指期夜盤（近月）最新一筆。
 * 近月 = 最新日期當天、after_market、outright、volume>0 中 contract_date 最小者。
 */
export async function fetchTxfNight(): Promise<TxfNightQuote | null> {
  try {
    const rows = await finmindGet<FuturesDailyRow>({
      dataset: FUTURES_DATASET.DAILY,
      data_id: TXF_ID,
      start_date: startDateStr(LOOKBACK_DAYS),
    });
    const night = rows.filter(
      (r) => r.trading_session === NIGHT_SESSION && isOutright(r.contract_date) && r.volume > 0,
    );
    if (!night.length) {
      return null;
    }
    const latestDate = night.reduce((acc, r) => (r.date > acc ? r.date : acc), night[0].date);
    const sameDay = night
      .filter((r) => r.date === latestDate)
      .sort((a, b) => Number(a.contract_date) - Number(b.contract_date));
    const near = sameDay[0];
    return {
      date: near.date,
      close: near.close,
      changePoint: near.spread,
      changePct: near.spread_per,
    };
  } catch (e) {
    log.warn('台指期夜盤抓取失敗', { error: (e as Error).message });
    return null;
  }
}

const INST_LABEL = { foreign: '外資', trust: '投信', dealer: '自營商' } as const;

function toOi(row: FuturesInstRow | undefined): FuturesInstitutionOi {
  const longOi = row?.long_open_interest_balance_volume ?? 0;
  const shortOi = row?.short_open_interest_balance_volume ?? 0;
  return { longOi, shortOi, netOi: longOi - shortOi };
}

/** 三大法人台指期未平倉（最新日；外資 / 投信 / 自營商）。 */
export async function fetchTxfChips(): Promise<FuturesChip | null> {
  try {
    const rows = await finmindGet<FuturesInstRow>({
      dataset: FUTURES_DATASET.INSTITUTIONAL,
      data_id: TXF_ID,
      start_date: startDateStr(LOOKBACK_DAYS),
    });
    if (!rows.length) {
      return null;
    }
    const latestDate = rows.reduce((acc, r) => (r.date > acc ? r.date : acc), rows[0].date);
    const sameDay = rows.filter((r) => r.date === latestDate);
    const byInst = (label: string): FuturesInstRow | undefined =>
      sameDay.find((r) => r.institutional_investors === label);
    return {
      date: latestDate,
      foreign: toOi(byInst(INST_LABEL.foreign)),
      trust: toOi(byInst(INST_LABEL.trust)),
      dealer: toOi(byInst(INST_LABEL.dealer)),
    };
  } catch (e) {
    log.warn('台指期三大法人抓取失敗', { error: (e as Error).message });
    return null;
  }
}
