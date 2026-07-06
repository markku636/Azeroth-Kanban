// 「抄影片」的風格快選（純資料，client 可 import）。第一個＝預設：使用者要的是**好笑、有趣**的成片，
// 所以預設就把來源改編成娛樂性高的版本（沿用來源節奏，但調性拉成搞笑好看）。空 hint＝原封不動沿用來源調性。

export interface StylePreset { label: string; hint: string; comedy?: boolean }

export const STYLE_PRESETS: StylePreset[] = [
  { label: '好笑有趣', comedy: true, hint: '改編成「好笑、有趣、娛樂性高」的版本：放大反差與意外轉折、用生活化的吐槽與誇張反應製造笑點，節奏輕快、每一鏡都想讓人笑或想看下一鏡；就算來源本身很正經，也要找到能玩的哏把它變好看。在最好笑的反轉／爆點鏡把 punch 設 true、caption 放鋪陳、punchline 放吐槽爆點，並配一個卡點音效 sfx（vineboom／rimshot／scratch 擇一）讓笑點更炸。' },
  { label: '迷因吐槽', comedy: true, hint: '改編成迷因吐槽搞笑風格：情緒誇張、用 setup→反轉的爆點結構，多放大字幕與卡點音效。' },
  { label: '溫馨勵志', hint: '改編成溫馨勵志風格：情感真摯、節奏舒緩、結尾給人溫暖或啟發。' },
  { label: '懸疑反轉', hint: '改編成懸疑風格：開場拋出懸念、中段堆疊張力、結尾一個意想不到的反轉。' },
  { label: '知識科普', hint: '改編成知識科普風格：條理清楚、每一鏡給一個新資訊點、口吻專業但好懂。' },
  { label: '沿用來源', hint: '' },
];

/** 預設風格 hint（＝「好笑有趣」）。使用者沒特別選時就用它，讓成片預設就好笑。 */
export const DEFAULT_STYLE_HINT = STYLE_PRESETS[0].hint;

/** 這個 hint 是不是「喜劇向」的風格（用來判斷成片該不該有喜劇元素）。 */
export function isComedyHint(hint: string): boolean {
  return STYLE_PRESETS.some((p) => p.comedy && p.hint === hint);
}
