// style-preset.ts — 影片風格預設（純資料 + 純函式、零副作用）。把「調色 / BGM / 字幕樣式 /
// 鏡頭接縫 / 建議音效」打包成一個可選 preset，供 pipeline 各站在專案未自訂時取用。
// 只依賴同目錄型別（assemble 的 SubStyle、sfx 的 SfxName），方便原樣搬到其他專案。
import type { SubStyle } from "./assemble";
import type { SfxName } from "./sfx";

export type StylePresetId = 'meme-comedy' | 'dark-horror';

/** 一組影片風格的完整預設。全部欄位皆為「預設值」語意：專案有自訂時以專案為準。 */
export interface StylePreset {
  id: StylePresetId;
  /** assemble GRADE_STYLES 的 key（調色風格，如 'teal'、'horror'）。 */
  gradeStyle: string;
  /** music MOODS 的 key（BGM 和弦氛圍，如 'warm'、'horror'）。 */
  bgmMood: string;
  /** 專案未自訂字幕樣式時的預設（Partial：只覆蓋有列出的欄位）。 */
  subStyle: Partial<SubStyle>;
  /** 鏡頭接縫：同場景 / 換場景的交疊秒數，與換場景用的 xfade 轉場名。 */
  seams: { withinScene: number; sceneChange: number; sceneChangeTransition: string };
  /** 此風格建議使用的合成音效（供排 cue 時挑選；非白名單，僅建議）。 */
  sfxSuggested: SfxName[];
  /** false → 只設 sfx、不觸發迷因大字（meme caption）路徑。 */
  memeCaptions: boolean;
}

export const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
  // 迷因吐槽搞笑：原有預設調色 + 迷因大字 + 經典迷因音效；接縫短而俐落保持節奏。
  'meme-comedy': {
    id: 'meme-comedy',
    gradeStyle: 'teal',
    bgmMood: 'warm',
    subStyle: {},
    seams: { withinScene: 0.25, sceneChange: 0.5, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['vineboom', 'scratch', 'rimshot', 'ding', 'whoosh', 'boing'],
    memeCaptions: true,
  },
  // 黑暗恐怖：horror 調色 + 恐怖 BGM；字幕淡灰 serif、逐句 pop-on、加底板；接縫拉長營造壓迫感。
  'dark-horror': {
    id: 'dark-horror',
    gradeStyle: 'horror',
    bgmMood: 'horror',
    subStyle: { color: '#c9c9c9', segment: true, plate: true, fontKind: 'serif' },
    seams: { withinScene: 0.4, sceneChange: 0.7, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['heartbeat', 'drone', 'sting', 'giggle', 'riser', 'whisper', 'vineboom'],
    memeCaptions: false,
  },
};

/** 依 id 取風格預設；未知 / 未設定回 undefined（呼叫端 fallback 既有行為 = 零回歸）。 */
export function getStylePreset(id?: string | null): StylePreset | undefined {
  return id ? STYLE_PRESETS[id as StylePresetId] : undefined;
}
