/**
 * 國際盤 / 期貨夜盤資料層：美股四大指數 + 台指期夜盤 + 三大法人未平倉。
 * 併抓三來源（個別容錯），讀最新加權指數收盤算期現價差，upsert GlobalMarketDaily。
 */
import { Prisma } from '@prisma/client';
import type { GlobalMarketData } from '@azeroth/common';
import { prisma } from '../db.js';
import { fetchUsIndices } from './us-market.js';
import { fetchTxfNight, fetchTxfChips } from './futures.js';
import { log } from '../logger.js';

/** 台北時區今日（YYYY-MM-DD）→ 當日 UTC 零時 Date（一天一列的主鍵）。 */
function taipeiTodayUtc(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 抓取國際盤快照並 upsert。回傳寫入的資料。 */
export async function loadGlobalMarket(): Promise<GlobalMarketData> {
  const [usIndices, night, chips, latestMarket] = await Promise.all([
    fetchUsIndices(),
    fetchTxfNight(),
    fetchTxfChips(),
    prisma.marketDaily.findFirst({ orderBy: { date: 'desc' }, select: { taiexClose: true } }),
  ]);

  const taiexClose = latestMarket?.taiexClose ?? null;
  const basis =
    night?.close != null && taiexClose != null ? round2(night.close - taiexClose) : null;

  const date = taipeiTodayUtc();
  const data = {
    usIndices: usIndices as unknown as Prisma.InputJsonValue,
    txfNightClose: night?.close ?? null,
    txfNightChangePct: night?.changePct ?? null,
    txfNightChangePoint: night?.changePoint ?? null,
    txfBasis: basis,
    // Json? 欄位設 NULL 需用 Prisma.DbNull（不可直接傳 null）
    futChips: chips ? (chips as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
  await prisma.globalMarketDaily.upsert({
    where: { date },
    update: data,
    create: { date, ...data },
  });

  log.info('global market loaded', {
    date: date.toISOString().slice(0, 10),
    usIndices: usIndices.length,
    txfNightClose: night?.close ?? null,
    txfNightChangePct: night?.changePct ?? null,
    basis,
    chips: chips ? 'yes' : 'no',
  });

  return {
    date: date.toISOString().slice(0, 10),
    usIndices,
    txfNight: {
      close: night?.close ?? null,
      changePct: night?.changePct ?? null,
      changePoint: night?.changePoint ?? null,
      basis,
    },
    futChips: chips ?? null,
  };
}
