// 縮圖 A/B 變體配方：純資料模組（無 node 依賴），client component 可直接 import（同 style-preset.ts 模式）。
// 引擎（assemble.ts）與縮圖 route 共用同一份，UI 的變體卡也吃這裡＝單一來源。

/** 縮圖標題位置（A/B 變體用）：bottom=左下（預設，零回歸）、top=左上、center=垂直置中。 */
export type ThumbTitlePos = 'bottom' | 'top' | 'center';

/**
 * 縮圖 A/B 變體配方（對標付費工具的縮圖測試）：同一張關鍵幀＋標題，換標題位置與強調色，一次產三版供挑選比較。
 * accent 省略＝沿用專案／模板色（第一版刻意等同現況＝零回歸）；其餘用高點閱率的醒目色。
 */
export const THUMBNAIL_VARIANTS: { key: string; label: string; titlePos: ThumbTitlePos; accent?: string }[] = [
  { key: 'a', label: '左下・品牌色', titlePos: 'bottom' },
  { key: 'b', label: '左上・熱紅', titlePos: 'top', accent: '#FF3B3B' },
  { key: 'c', label: '置中・亮青', titlePos: 'center', accent: '#22D3EE' },
];
