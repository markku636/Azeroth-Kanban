/**
 * 基本面資料（FinMind 免費):月營收(YoY/MoM)、本益比/殖利率、EPS。
 */
import type { StockFundamentalDto } from '@azeroth/common';
import { prisma } from '../db.js';
import { finmindGet } from './finmind.js';

interface RevenueRow {
  revenue: number;
  revenue_month: number;
  revenue_year: number;
}
export interface PerRow {
  date: string;
  PER: number;
  PBR: number;
  dividend_yield: number;
}
interface FinStmtRow {
  date: string;
  type: string;
  value: number;
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * 抓取逐日 PER/PBR/殖利率（TaiwanStockPER）。預設 36 個月，供估值河流圖與基本面快照共用，
 * 同一回應由 analysis job 傳給 loadFundamentals 與 loadValuationHistory，避免重複呼叫。
 */
export async function fetchPerHistory(symbol: string, months = 36): Promise<PerRow[]> {
  return finmindGet<PerRow>({
    dataset: 'TaiwanStockPER',
    data_id: symbol,
    start_date: isoMonthsAgo(months),
  }).catch(() => []);
}

/**
 * 載入基本面並 upsert StockFundamental。任一來源失敗則該欄位留 null。
 * @param perRows 可預先抓好的 PER 序列（與估值河流共用）；未提供則自行抓取。
 */
export async function loadFundamentals(
  symbol: string,
  perRows?: PerRow[],
): Promise<StockFundamentalDto> {
  const [revenues, pers, fins] = await Promise.all([
    finmindGet<RevenueRow>({
      dataset: 'TaiwanStockMonthRevenue',
      data_id: symbol,
      start_date: isoMonthsAgo(15),
    }).catch(() => []),
    perRows ?? fetchPerHistory(symbol),
    finmindGet<FinStmtRow>({
      dataset: 'TaiwanStockFinancialStatements',
      data_id: symbol,
      start_date: isoMonthsAgo(6),
    }).catch(() => []),
  ]);

  // 月營收：依 year*12+month 排序取最新
  const sorted = [...revenues].sort(
    (a, b) => a.revenue_year * 12 + a.revenue_month - (b.revenue_year * 12 + b.revenue_month),
  );
  const latest = sorted[sorted.length - 1];
  let revenue: number | null = null;
  let revenuePeriod: string | null = null;
  let revenueMom: number | null = null;
  let revenueYoy: number | null = null;
  if (latest) {
    revenue = latest.revenue;
    revenuePeriod = `${latest.revenue_year}-${String(latest.revenue_month).padStart(2, '0')}`;
    const prevMonth = sorted[sorted.length - 2];
    if (prevMonth && prevMonth.revenue > 0) {
      revenueMom = Math.round(((latest.revenue - prevMonth.revenue) / prevMonth.revenue) * 1000) / 10;
    }
    const yoyRow = sorted.find(
      (r) => r.revenue_year === latest.revenue_year - 1 && r.revenue_month === latest.revenue_month,
    );
    if (yoyRow && yoyRow.revenue > 0) {
      revenueYoy = Math.round(((latest.revenue - yoyRow.revenue) / yoyRow.revenue) * 1000) / 10;
    }
  }

  // 估值：最新一筆 PER
  const lastPer = [...pers].sort((a, b) => a.date.localeCompare(b.date)).pop();

  // EPS：最新一筆 type=EPS
  const eps =
    [...fins]
      .filter((f) => f.type === 'EPS')
      .sort((a, b) => a.date.localeCompare(b.date))
      .pop()?.value ?? null;

  const dto: StockFundamentalDto = {
    revenuePeriod,
    revenue,
    revenueYoy,
    revenueMom,
    eps,
    per: lastPer?.PER ?? null,
    pbr: lastPer?.PBR ?? null,
    dividendYield: lastPer?.dividend_yield ?? null,
  };

  await prisma.stockFundamental.upsert({
    where: { symbol },
    update: {
      revenuePeriod: dto.revenuePeriod,
      revenue: dto.revenue != null ? BigInt(Math.round(dto.revenue)) : null,
      revenueYoy: dto.revenueYoy,
      revenueMom: dto.revenueMom,
      eps: dto.eps,
      per: dto.per,
      pbr: dto.pbr,
      dividendYield: dto.dividendYield,
    },
    create: {
      symbol,
      revenuePeriod: dto.revenuePeriod,
      revenue: dto.revenue != null ? BigInt(Math.round(dto.revenue)) : null,
      revenueYoy: dto.revenueYoy,
      revenueMom: dto.revenueMom,
      eps: dto.eps,
      per: dto.per,
      pbr: dto.pbr,
      dividendYield: dto.dividendYield,
    },
  });

  return dto;
}
