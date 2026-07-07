// 留存健檢：對整條分鏡做「觀眾會不會在這裡流失」的節奏診斷，對標 Opus Clip／Submagic 的留存提示。
// 純函式、client-safe（只 import 同層的 hook-check）。秒數由呼叫端用引擎同款估算餵進來，確保面板與實際成片一致。
import { analyzeHook, type HookReport } from './hook-check';

export interface LintShot {
  shotNo: number;
  /** 該鏡旁白（第一鏡的旁白＝真正的開場鉤子，比 logline 更準）。 */
  text: string;
  /** 估算秒數（呼叫端用與引擎一致的模型算好傳入）。 */
  seconds: number;
}

export interface RetentionIssue {
  severity: 'warn' | 'info';
  /** 對應鏡號；整體性問題為 null。 */
  shotNo: number | null;
  title: string;
  tip: string;
}

export interface RetentionReport {
  issues: RetentionIssue[];
  /** 第一鏡旁白的開場鉤子分析。 */
  hook: HookReport;
  totalSeconds: number;
  shotCount: number;
  avgSeconds: number;
  /** 被判定過長的鏡號（不含開場鏡，開場另有規則）。 */
  longShots: number[];
}

const LONG_SHOT_SEC = 8;   // 單一非開場鏡超過此秒數 → 容易分心
const OPENER_MAX_SEC = 6;  // 開場鏡要更快
const SLOW_AVG_SEC = 6.5;  // 平均每鏡秒數上限（解說片節奏）

export function lintRetention(shots: LintShot[]): RetentionReport {
  const shotCount = shots.length;
  const totalSeconds = shots.reduce((a, s) => a + (s.seconds > 0 ? s.seconds : 0), 0);
  const avgSeconds = shotCount ? totalSeconds / shotCount : 0;
  const hook = analyzeHook(shots[0]?.text ?? '');
  const issues: RetentionIssue[] = [];

  // 1) 開場鉤子（用真正的第一鏡旁白）
  if (shotCount > 0 && hook.verdict === 'weak') {
    issues.push({ severity: 'warn', shotNo: shots[0].shotNo, title: '開場鉤子偏弱', tip: hook.tips[0] ?? '前 3 秒用問句或反直覺斷言抓住觀眾' });
  }

  // 2) 開場鏡太長（開頭節奏）
  if (shotCount > 0 && shots[0].seconds > OPENER_MAX_SEC) {
    issues.push({ severity: 'warn', shotNo: shots[0].shotNo, title: '開場鏡太長', tip: `開場停在同一畫面約 ${shots[0].seconds.toFixed(1)} 秒偏久，開頭節奏要快、先拋鉤子再展開` });
  }

  // 3) 個別過長鏡（不含開場鏡，避免與規則 2 重複）
  const longShotList = shots.slice(1).filter((s) => s.seconds > LONG_SHOT_SEC);
  const longShots = longShotList.map((s) => s.shotNo);
  for (const s of longShotList.slice(0, 3)) {
    issues.push({ severity: 'warn', shotNo: s.shotNo, title: `第 ${s.shotNo} 鏡偏長（約 ${s.seconds.toFixed(1)} 秒）`, tip: '單一畫面超過 8 秒容易分心，切成兩鏡或加入 B-roll／運鏡變化' });
  }
  if (longShots.length > 3) {
    issues.push({ severity: 'info', shotNo: null, title: `另有 ${longShots.length - 3} 個過長鏡`, tip: '過長鏡集中會拖慢整體節奏，建議逐一拆短' });
  }

  // 4) 整體節奏偏慢
  if (shotCount >= 3 && avgSeconds > SLOW_AVG_SEC) {
    issues.push({ severity: 'info', shotNo: null, title: `整體節奏偏慢（平均每鏡 ${avgSeconds.toFixed(1)} 秒）`, tip: '解說片建議每 3–5 秒換一次畫面維持注意力' });
  }

  return { issues, hook, totalSeconds, shotCount, avgSeconds, longShots };
}
