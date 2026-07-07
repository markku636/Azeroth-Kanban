// 開場鉤子健檢：付費短影音工具（Opus Clip 病毒分數／Submagic hook）主打的「前 3 秒留人」分析，
// 這裡用確定性啟發式（無 AI、可單元測試）評估開場一句話：問句／數字／反直覺斷言／對觀眾說話／急迫感為加分，
// 開場問候語與冗長開頭為扣分。純函式、無 engine 依賴，client component 可直接 import。

export interface HookSignal {
  key: string;
  /** UI 顯示的訊號名稱。 */
  label: string;
  /** 該訊號是否命中。 */
  hit: boolean;
  /** 命中時的加分權重。 */
  weight: number;
}

export interface HookPenalty {
  key: string;
  label: string;
  hit: boolean;
  /** 命中時的扣分（正數，計分時相減）。 */
  weight: number;
}

export type HookVerdict = 'strong' | 'ok' | 'weak';

export interface HookReport {
  /** 0–100。 */
  score: number;
  verdict: HookVerdict;
  /** 被分析的開場句（去掉前後空白、只取第一句）。 */
  opener: string;
  /** 開場句字數（code point）。 */
  length: number;
  signals: HookSignal[];
  penalties: HookPenalty[];
  /** 只列出「還能更好」的具體建議；已經很強時給一句肯定。 */
  tips: string[];
}

const BASE = 35;

// —— 加分訊號的關鍵詞／樣式 ——
const QUESTION = /[？?]|嗎|如何|為什麼|為何|怎麼|怎樣|難道|是不是|有沒有|知不知道|你知道|要不要|該不該/;
const NUMBER = /[0-9０-９]|[一二三四五六七八九十百千萬]\s*(個|種|招|步|大|條|點|個|項|次|倍|成|年|天|秒|分鐘|%|％)|第[一二三四五六七八九十0-9]|[%％]|倍/;
const BOLD = /其實|最[強大好慘扯猛]|竟然|居然|原來|真相|秘密|沒人|從來沒|從沒|千萬別|別再|停止|錯了|顛覆|驚人|想不到|沒想到|唯一|再也|居然|不敢相信|你以為/;
const SECOND_PERSON = /你|妳|您|你們/;
const URGENCY = /現在|今天|馬上|立刻|趕快|秒懂|一次搞懂|一次看懂|快速|三分鐘|30\s*秒|三十秒/;

// —— 扣分樣式 ——
// 開場問候／清嗓（留人殺手）：只在句首附近出現才算。
const GREETING = /^(?:嗨+|哈囉+|你好|大家好|哈嘍|安安|歡迎(?:來到|回來|收看)?|今天(?:要|想)?(?:跟|和|與)?大家|今天(?:要|想)?(?:來)?(?:跟大家)?分享|在(?:我們)?開始(?:之前)?|首先|廢話不多說|話不多說|讓我們)/;
// 冗字開頭（第一個字就沒資訊量）。
const VAGUE_START = /^(?:這個|那個|嗯+|呃+|所以說?|然後呢?|就是說?|基本上|總之)/;

const OPENER_MAX = 40;

/** 取第一句：切在句末標點或換行；若無標點則取整段。 */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/^[^。！？!?\n]*[。！？!?]?/);
  const first = (m ? m[0] : trimmed).trim();
  return first || trimmed;
}

/** code point 長度（CJK 安全，避免 surrogate pair 誤算）。 */
function cpLength(s: string): number {
  return Array.from(s).length;
}

export function analyzeHook(text: string): HookReport {
  const full = (text ?? '').trim();
  const opener = firstSentence(full);
  const length = cpLength(opener);
  // 訊號在「開場前 ~3 秒」的視窗內偵測（前 40 字），因為好鉤子常是「短問句＋payoff」，
  // 只看第一句會漏掉標點後的關鍵承諾（例：「你知道嗎？其實 90% 的人都用錯了」）。
  const window = Array.from(full).slice(0, OPENER_MAX).join('');

  const signals: HookSignal[] = [
    { key: 'question', label: '問句開場', hit: QUESTION.test(window), weight: 18 },
    { key: 'number', label: '具體數字', hit: NUMBER.test(window), weight: 14 },
    { key: 'bold', label: '反直覺斷言', hit: BOLD.test(window), weight: 16 },
    { key: 'you', label: '對觀眾說話', hit: SECOND_PERSON.test(window), weight: 12 },
    { key: 'urgency', label: '急迫感', hit: URGENCY.test(window), weight: 8 },
  ];

  // 問候／冗字錨在真正的開頭（^），扣的是「開場方式」；太長看的是第一句的長度。
  const tooLong = length > OPENER_MAX;
  const penalties: HookPenalty[] = [
    { key: 'greeting', label: '開場問候／清嗓', hit: length > 0 && GREETING.test(full), weight: 24 },
    { key: 'tooLong', label: '開場太長', hit: tooLong, weight: 14 },
    { key: 'vague', label: '冗字開頭', hit: VAGUE_START.test(full), weight: 8 },
  ];

  let score = BASE;
  for (const s of signals) if (s.hit) score += s.weight;
  for (const p of penalties) if (p.hit) score -= p.weight;
  // 空開場沒東西可分析 → 直接 0。
  if (length === 0) score = 0;
  score = Math.max(0, Math.min(100, score));

  const verdict: HookVerdict = score >= 68 ? 'strong' : score >= 42 ? 'ok' : 'weak';

  const tips: string[] = [];
  const by = (k: string) => penalties.find((p) => p.key === k)?.hit ?? false;
  const has = (k: string) => signals.find((s) => s.key === k)?.hit ?? false;
  if (length === 0) {
    tips.push('先填一句話前提（logline），我才能幫你健檢開場鉤子');
    return { score, verdict, opener, length, signals, penalties, tips };
  }
  if (by('greeting')) tips.push('刪掉開場問候語（大家好／歡迎），黃金前 3 秒直接切入重點');
  if (by('tooLong')) tips.push('開場第一句砍到 20 字內，一句話講完最抓人的那個點');
  if (by('vague')) tips.push('拿掉開頭的贅字（這個／所以／然後），第一個字就給資訊');
  if (!has('question') && !has('bold')) tips.push('用問句或反直覺斷言製造好奇（例：為什麼…？／其實…）');
  if (!has('number')) tips.push('加一個具體數字或比例讓承諾更實在（例：3 個方法、90%）');
  if (!has('you')) tips.push('用「你」直接對觀眾說話，把它變成他自己的事');
  if (tips.length === 0) tips.push('開場鉤子很穩，維持這個節奏');
  // 最多給 4 條，避免資訊過載。
  return { score, verdict, opener, length, signals, penalties, tips: tips.slice(0, 4) };
}
