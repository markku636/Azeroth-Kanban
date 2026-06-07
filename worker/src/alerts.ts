/**
 * 警報引擎：使用者設定的價格/RSI 條件，分析時檢查並推播。
 */
import type { Alert, AlertType } from '@prisma/client';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import { prisma } from './db.js';
import { log } from './logger.js';
import { linePushQueue } from './queue/queues.js';

export interface AlertContext {
  lastClose: number;
  rsi: number | null;
  /** 近 5 日融資餘額變化（張，負=減） */
  marginChange5?: number | null;
  /** 近 5 日外資持股比例變化（百分點） */
  foreignRatioChange5?: number | null;
  /** ADX 趨勢強度 */
  adx?: number | null;
  /** +DI / −DI */
  diPlus?: number | null;
  diMinus?: number | null;
  /** 20 日乖離率（%） */
  bias20?: number | null;
  /** 三大法人連續買賣超天數（正=連買、負=連賣） */
  instStreakDays?: number | null;
  /** 背離旗標 */
  divBullish?: boolean;
  divBearish?: boolean;
  /** 估值位階 */
  valuationZone?: 'cheap' | 'fair' | 'expensive' | 'unknown' | null;
}

/** 純函式：判斷單一 alert 是否觸發。 */
export function evaluateAlert(
  alert: Pick<Alert, 'type' | 'threshold'>,
  ctx: AlertContext,
): boolean {
  const { type, threshold } = alert;
  switch (type) {
    case 'PRICE_ABOVE':
      return ctx.lastClose >= threshold;
    case 'PRICE_BELOW':
      return ctx.lastClose <= threshold;
    case 'RSI_ABOVE':
      return ctx.rsi != null && ctx.rsi >= threshold;
    case 'RSI_BELOW':
      return ctx.rsi != null && ctx.rsi <= threshold;
    case 'MARGIN_DROP':
      // 近 5 日融資減幅達門檻（threshold 為正張數）
      return ctx.marginChange5 != null && ctx.marginChange5 <= -Math.abs(threshold);
    case 'FOREIGN_RATIO_UP':
      // 近 5 日外資持股增幅達門檻（百分點）
      return ctx.foreignRatioChange5 != null && ctx.foreignRatioChange5 >= threshold;
    case 'ADX_TREND_START':
      // ADX 突破門檻（預設 25）且多方主導
      return ctx.adx != null && ctx.adx >= threshold && (ctx.diPlus ?? 0) > (ctx.diMinus ?? 0);
    case 'BIAS_EXTREME_HIGH':
      return ctx.bias20 != null && ctx.bias20 >= threshold;
    case 'BIAS_EXTREME_LOW':
      return ctx.bias20 != null && ctx.bias20 <= -Math.abs(threshold);
    case 'DIVERGENCE_BULLISH':
      return ctx.divBullish === true;
    case 'DIVERGENCE_BEARISH':
      return ctx.divBearish === true;
    case 'INSTITUTIONAL_STREAK':
      return ctx.instStreakDays != null && Math.abs(ctx.instStreakDays) >= threshold;
    case 'VALUATION_CHEAP':
      return ctx.valuationZone === 'cheap';
    case 'VALUATION_EXPENSIVE':
      return ctx.valuationZone === 'expensive';
    default:
      return false;
  }
}

const TYPE_LABEL: Record<AlertType, string> = {
  PRICE_ABOVE: '價格突破',
  PRICE_BELOW: '價格跌破',
  RSI_ABOVE: 'RSI 高於',
  RSI_BELOW: 'RSI 低於',
  MARGIN_DROP: '融資減幅(張)達',
  FOREIGN_RATIO_UP: '外資持股增(pp)達',
  ADX_TREND_START: 'ADX 趨勢確立(≥)',
  BIAS_EXTREME_HIGH: '正乖離(%)達',
  BIAS_EXTREME_LOW: '負乖離(%)達',
  DIVERGENCE_BULLISH: '出現底背離',
  DIVERGENCE_BEARISH: '出現頂背離',
  INSTITUTIONAL_STREAK: '法人連續買賣(日)達',
  VALUATION_CHEAP: '估值落入便宜區',
  VALUATION_EXPENSIVE: '估值落入昂貴區',
};

function triggeredToday(at: Date | null): boolean {
  if (!at) return false;
  const today = new Date().toISOString().slice(0, 10);
  return at.toISOString().slice(0, 10) === today;
}

/**
 * 檢查某 symbol 的所有 active alerts；觸發者（當日未觸發過）→ 推播給該 member 的 LINE 訂閱者，
 * 並更新 lastTriggeredAt。回傳觸發數。
 */
export async function runAlertChecks(symbol: string, ctx: AlertContext): Promise<number> {
  const alerts = await prisma.alert.findMany({ where: { symbol, isActive: true } });
  let fired = 0;

  for (const alert of alerts) {
    if (!evaluateAlert(alert, ctx)) continue;
    if (triggeredToday(alert.lastTriggeredAt)) continue;

    const subs = await prisma.lineSubscriber.findMany({
      where: { isActive: true, memberId: alert.memberId },
      select: { lineUserId: true },
    });

    let valueStr: string;
    if (alert.type.startsWith('PRICE')) valueStr = `現價 ${ctx.lastClose}`;
    else if (alert.type.startsWith('RSI')) valueStr = `RSI ${ctx.rsi}`;
    else if (alert.type === 'MARGIN_DROP') valueStr = `近5日融資變化 ${ctx.marginChange5} 張`;
    else if (alert.type === 'FOREIGN_RATIO_UP')
      valueStr = `近5日外資持股變化 ${ctx.foreignRatioChange5} pp`;
    else if (alert.type === 'ADX_TREND_START') valueStr = `ADX ${ctx.adx}`;
    else if (alert.type.startsWith('BIAS')) valueStr = `20日乖離 ${ctx.bias20}%`;
    else if (alert.type.startsWith('DIVERGENCE')) valueStr = ctx.divBullish ? '底背離' : '頂背離';
    else if (alert.type === 'INSTITUTIONAL_STREAK') valueStr = `法人連續 ${ctx.instStreakDays} 日`;
    else if (alert.type.startsWith('VALUATION')) valueStr = `估值位階 ${ctx.valuationZone ?? '—'}`;
    else valueStr = `${alert.threshold}`;
    const text =
      `🔔 警報觸發：${symbol} ${TYPE_LABEL[alert.type]} ${alert.threshold}\n${valueStr}\n\n${STOCK_DISCLAIMER}`;

    if (subs.length) {
      await linePushQueue.add('push', {
        to: subs.map((s) => s.lineUserId),
        messages: [{ type: 'text', text }],
      });
    }

    await prisma.alert.update({ where: { id: alert.id }, data: { lastTriggeredAt: new Date() } });
    fired++;
    log.info('alert fired', { symbol, type: alert.type, threshold: alert.threshold, pushedTo: subs.length });
  }
  return fired;
}
