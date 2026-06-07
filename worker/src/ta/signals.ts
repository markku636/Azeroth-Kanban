/**
 * 規則式買賣訊號引擎。
 *
 * 產出 baseline TradeSignal（量化）；Deep Agent 之後可在此之上做質化研判。
 * 規則：均線黃金/死亡交叉、MACD 翻多/翻空、RSI 超買超賣、KD 交叉、量能、K 線型態。
 */
import type { StockOhlcv, TradeSignal, SignalAction, StockIndicators } from '@azeroth/common';
import { SMA, MACD, Stochastic, RSI } from 'technicalindicators';
import { computeIndicators, detectPatterns } from './indicators.js';

/**
 * 是否為「強訊號」(值得主動推播)：明確買/賣方向且信心達門檻。
 * @param minConfidence 信心門檻，預設 0.5
 */
export function isStrongSignal(signal: TradeSignal, minConfidence = 0.5): boolean {
  return signal.action !== 'HOLD' && signal.confidence >= minConfidence;
}

interface Reason {
  text: string;
  weight: number; // 正=偏多，負=偏空
}

function crossUp(prev: number | undefined, cur: number | undefined, prevB: number | undefined, curB: number | undefined): boolean {
  if (prev == null || cur == null || prevB == null || curB == null) return false;
  return prev <= prevB && cur > curB;
}
function crossDown(prev: number | undefined, cur: number | undefined, prevB: number | undefined, curB: number | undefined): boolean {
  if (prev == null || cur == null || prevB == null || curB == null) return false;
  return prev >= prevB && cur < curB;
}
function tail<T>(a: T[], n: number): (T | undefined)[] {
  return [a[a.length - n], a[a.length - n + 1]] as (T | undefined)[];
}

/**
 * 當日無事件訊號時，用指標描述當前「趨勢態」，避免空洞的「無明顯訊號」。
 * 純文字增益，不影響 action / score / confidence。
 */
function describeTrend(ind: StockIndicators, lastClose: number): string {
  const parts: string[] = [];
  if (ind.ma5 != null && ind.ma20 != null && ind.ma60 != null) {
    if (ind.ma5 > ind.ma20 && ind.ma20 > ind.ma60) {
      parts.push('均線多頭排列');
    } else if (ind.ma5 < ind.ma20 && ind.ma20 < ind.ma60) {
      parts.push('均線空頭排列');
    } else {
      parts.push('均線糾結');
    }
  }
  if (ind.ma20 != null) {
    parts.push(lastClose >= ind.ma20 ? '價站上月線' : '價跌破月線');
  }
  if (ind.rsi14 != null) {
    parts.push(`RSI ${ind.rsi14.toFixed(0)}`);
  }
  if (ind.kd.k != null && ind.kd.d != null) {
    parts.push(ind.kd.k >= ind.kd.d ? 'KD 偏多' : 'KD 偏空');
  }
  if (parts.length === 0) {
    return '今日無新進出訊號，且資料量不足以判讀趨勢（建議累積更多日 K）。';
  }
  return `今日無新進出訊號，趨勢態：${parts.join('、')}。`;
}

/** 由日 K 產生規則式訊號。需至少 ~60 筆資料較準。 */
export function generateSignal(symbol: string, ohlcv: StockOhlcv[]): TradeSignal {
  const date = ohlcv.length ? ohlcv[ohlcv.length - 1].date : new Date().toISOString().slice(0, 10);
  const indicators = computeIndicators(ohlcv);
  const patterns = detectPatterns(ohlcv);
  const reasons: Reason[] = [];

  const close = ohlcv.map((o) => o.close);
  const lastClose = close[close.length - 1] ?? 0;

  // 均線黃金/死亡交叉（MA5 x MA20）
  const ma5 = SMA.calculate({ period: 5, values: close });
  const ma20 = SMA.calculate({ period: 20, values: close });
  const [p5, c5] = tail(ma5, 2);
  const [p20, c20] = tail(ma20, 2);
  if (crossUp(p5, c5, p20, c20)) reasons.push({ text: 'MA5 黃金交叉 MA20', weight: 2 });
  if (crossDown(p5, c5, p20, c20)) reasons.push({ text: 'MA5 死亡交叉 MA20', weight: -2 });

  // MACD 柱狀體翻多/翻空
  const macd = MACD.calculate({
    values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const [pm, cm] = tail(macd, 2);
  if (pm?.histogram != null && cm?.histogram != null) {
    if (pm.histogram <= 0 && cm.histogram > 0) reasons.push({ text: 'MACD 柱狀體翻多', weight: 1.5 });
    if (pm.histogram >= 0 && cm.histogram < 0) reasons.push({ text: 'MACD 柱狀體翻空', weight: -1.5 });
  }

  // RSI 超買超賣
  const rsi = RSI.calculate({ period: 14, values: close });
  const rsiLast = rsi[rsi.length - 1];
  if (rsiLast != null) {
    if (rsiLast < 30) reasons.push({ text: `RSI ${rsiLast.toFixed(0)} 超賣`, weight: 1.5 });
    else if (rsiLast > 70) reasons.push({ text: `RSI ${rsiLast.toFixed(0)} 超買`, weight: -1.5 });
  }

  // KD 低/高檔交叉
  const stoch = Stochastic.calculate({
    high: ohlcv.map((o) => o.high), low: ohlcv.map((o) => o.low), close, period: 14, signalPeriod: 3,
  });
  const [pk, ck] = tail(stoch, 2);
  if (pk && ck) {
    if (crossUp(pk.k, ck.k, pk.d, ck.d) && ck.k < 40) reasons.push({ text: 'KD 低檔黃金交叉', weight: 1.5 });
    if (crossDown(pk.k, ck.k, pk.d, ck.d) && ck.k > 60) reasons.push({ text: 'KD 高檔死亡交叉', weight: -1.5 });
  }

  // 量能
  if (indicators.volumeRatio != null && indicators.volumeRatio > 1.5) {
    reasons.push({ text: `成交量放大 ${indicators.volumeRatio}x`, weight: 0.8 });
  }

  // K 線型態
  for (const p of patterns) {
    if (p.bias === 'bullish') reasons.push({ text: `出現${p.code}型態`, weight: 1 });
    if (p.bias === 'bearish') reasons.push({ text: `出現${p.code}型態`, weight: -1 });
  }

  // 趨勢動能（WP-A）：威廉%R / CCI / 乖離率 的位階反轉 + 背離事件
  // 註：ADX 趨勢、SAR 多空位置屬「持續狀態」，歸 momentum 評分因子，不在事件型訊號重複計分。
  const { williamsR, cci, bias, divergence } = indicators;
  if (williamsR != null) {
    if (williamsR < -80) reasons.push({ text: `威廉%R ${williamsR} 超賣`, weight: 1.2 });
    else if (williamsR > -20) reasons.push({ text: `威廉%R ${williamsR} 超買`, weight: -1.2 });
  }
  if (cci != null) {
    if (cci > 100) reasons.push({ text: `CCI ${cci} 轉強`, weight: 1 });
    else if (cci < -100) reasons.push({ text: `CCI ${cci} 轉弱`, weight: -1 });
  }
  if (bias.bias20 != null) {
    if (bias.bias20 > 12) reasons.push({ text: `20日乖離 +${bias.bias20}% 過大`, weight: -1 });
    else if (bias.bias20 < -12) reasons.push({ text: `20日乖離 ${bias.bias20}% 過低`, weight: 1 });
  }
  if (divergence.macdBullish) reasons.push({ text: 'MACD 底背離', weight: 1.5 });
  if (divergence.macdBearish) reasons.push({ text: 'MACD 頂背離', weight: -1.5 });
  if (divergence.rsiBullish) reasons.push({ text: 'RSI 底背離', weight: 1.5 });
  if (divergence.rsiBearish) reasons.push({ text: 'RSI 頂背離', weight: -1.5 });
  if (divergence.volumeBullish) reasons.push({ text: '量價底背離', weight: 1 });
  if (divergence.volumeBearish) reasons.push({ text: '量價頂背離', weight: -1 });

  const score = reasons.reduce((s, r) => s + r.weight, 0);
  let action: SignalAction = 'HOLD';
  if (score >= 2) action = 'BUY';
  else if (score <= -2) action = 'SELL';

  // 信心：依分數絕對值映射到 0~1（飽和於 6）
  const confidence = Math.min(1, Math.abs(score) / 6);

  // 進出場參考：以布林帶/近期高低估算
  const { bollinger } = indicators;
  let entryZone: string | undefined;
  let stopLoss: number | undefined;
  let takeProfit: number | undefined;
  let timingNote: string | undefined;
  if (action === 'BUY') {
    const lower = bollinger.lower ?? lastClose * 0.97;
    entryZone = `${(lastClose * 0.99).toFixed(2)}~${lastClose.toFixed(2)}`;
    stopLoss = Math.round(Math.min(lower, lastClose * 0.95) * 100) / 100;
    takeProfit = Math.round((bollinger.upper ?? lastClose * 1.08) * 100) / 100;
    timingNote = '可分批於回測支撐時進場，跌破停損價出場。';
  } else if (action === 'SELL') {
    entryZone = `${lastClose.toFixed(2)}~${(lastClose * 1.01).toFixed(2)}`;
    timingNote = '偏空訊號，持有者可考慮減碼或設緊停利。';
  } else {
    timingNote = '訊號中性，建議觀望，等待明確方向。';
  }

  const positives = reasons.filter((r) => r.weight > 0).map((r) => r.text);
  const negatives = reasons.filter((r) => r.weight < 0).map((r) => r.text);
  const noEvent = positives.length === 0 && negatives.length === 0;
  const rationale =
    `綜合評分 ${score.toFixed(1)}。` +
    (positives.length ? ` 偏多因素：${positives.join('、')}。` : '') +
    (negatives.length ? ` 偏空因素：${negatives.join('、')}。` : '') +
    (noEvent ? ` ${describeTrend(indicators, lastClose)}` : '');

  return {
    symbol,
    date,
    action,
    entryZone,
    stopLoss,
    takeProfit,
    timingNote,
    confidence: Math.round(confidence * 100) / 100,
    rationale,
    patterns,
    indicators,
  };
}
