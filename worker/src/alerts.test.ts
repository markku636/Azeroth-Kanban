import { describe, it, expect } from 'vitest';
import { evaluateAlert } from './alerts.js';

describe('evaluateAlert', () => {
  it('PRICE_ABOVE：現價達門檻觸發', () => {
    expect(evaluateAlert({ type: 'PRICE_ABOVE', threshold: 100 }, { lastClose: 105, rsi: 50 })).toBe(true);
    expect(evaluateAlert({ type: 'PRICE_ABOVE', threshold: 100 }, { lastClose: 95, rsi: 50 })).toBe(false);
  });
  it('PRICE_BELOW：現價跌破觸發', () => {
    expect(evaluateAlert({ type: 'PRICE_BELOW', threshold: 100 }, { lastClose: 95, rsi: 50 })).toBe(true);
    expect(evaluateAlert({ type: 'PRICE_BELOW', threshold: 100 }, { lastClose: 105, rsi: 50 })).toBe(false);
  });
  it('RSI_ABOVE / RSI_BELOW', () => {
    expect(evaluateAlert({ type: 'RSI_ABOVE', threshold: 70 }, { lastClose: 1, rsi: 75 })).toBe(true);
    expect(evaluateAlert({ type: 'RSI_BELOW', threshold: 30 }, { lastClose: 1, rsi: 25 })).toBe(true);
    expect(evaluateAlert({ type: 'RSI_ABOVE', threshold: 70 }, { lastClose: 1, rsi: 60 })).toBe(false);
  });
  it('RSI 為 null 不觸發', () => {
    expect(evaluateAlert({ type: 'RSI_ABOVE', threshold: 70 }, { lastClose: 1, rsi: null })).toBe(false);
  });
});
