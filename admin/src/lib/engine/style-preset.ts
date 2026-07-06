// style-preset.ts — 影片風格預設（純資料 + 純函式、零副作用）。把「調色 / BGM / 字幕樣式 /
// 鏡頭接縫 / 建議音效」打包成一個可選 preset，供 pipeline 各站在專案未自訂時取用。
// 只依賴同目錄型別（assemble 的 SubStyle、sfx 的 SfxName），方便原樣搬到其他專案。
import type { SubStyle } from "./assemble";
import type { SfxName } from "./sfx";

export type StylePresetId = 'meme-comedy' | 'dark-horror' | 'clean-explainer' | 'tech-review' | 'vlog' | 'news-brief' | 'story-time' | 'tutorial';

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
  /** 片頭／片尾卡片（付費解說片標配）。intro=片頭標題卡（題名+前提，疊在首幀）、outro=片尾行動呼籲卡（CTA）。
   *  cta=片尾大字（取代舊「完」），accent=品牌強調色（片頭/CTA 下方色條）。未設＝不強制加卡（沿用 env 開關）。 */
  cards?: { intro?: boolean; outro?: boolean; cta?: string; accent?: string };
  /** 一鍵套用時的預設開關（選此模板即寫進 spec 當起點，使用者之後可個別調整）。 */
  sceneTitles?: boolean;   // 章節標題 lower-third
  autoSfx?: boolean;       // 換場景自動 whoosh
  filmFinish?: { intensity: 'subtle' | 'strong' }; // 電影感收尾
  /** UI 顯示用：模板中文名＋一句話簡介（供選單/卡片）。 */
  label?: string;
  blurb?: string;
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
    cards: { intro: true, outro: true, cta: '喜歡就追蹤，下支更瘋', accent: '#FFD400' },
    label: '迷因搞笑', blurb: '迷因大字＋經典音效＋俐落快切',
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
    cards: { intro: true, outro: true, cta: '還想被嚇？追蹤我', accent: '#C81E2E' },
    label: '暗黑恐怖', blurb: 'horror 調色＋恐怖 BGM＋襯線字幕＋壓迫感接縫',
  },
  // 乾淨解說：明亮 clean 調色＋慵懶 BGM＋卡拉OK逐字高亮字幕＋片頭/CTA＋章節標題＋轉場音效＝最百搭的解說模板。
  'clean-explainer': {
    id: 'clean-explainer',
    gradeStyle: 'clean',
    bgmMood: 'chill',
    subStyle: { segment: true, highlight: true, highlightColor: '#FFD400', fontKind: 'bold' },
    seams: { withinScene: 0.3, sceneChange: 0.5, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['ding', 'whoosh', 'rimshot'],
    memeCaptions: false,
    cards: { intro: true, outro: true, cta: '喜歡這支解說？訂閱看更多', accent: '#4DA6FF' },
    sceneTitles: true, autoSfx: true,
    label: '乾淨解說', blurb: '明亮乾淨＋逐字高亮字幕＋章節標題＋CTA，最百搭',
  },
  // 科技評測：cyber 霓虹調色＋史詩 BGM＋綠色逐字高亮＋微電影感收尾＝科技/開箱/評測感。
  'tech-review': {
    id: 'tech-review',
    gradeStyle: 'cyber',
    bgmMood: 'epic',
    subStyle: { segment: true, highlight: true, highlightColor: '#22FF88', fontKind: 'bold' },
    seams: { withinScene: 0.25, sceneChange: 0.45, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['ding', 'whoosh', 'riser'],
    memeCaptions: false,
    cards: { intro: true, outro: true, cta: '追蹤第一手評測', accent: '#22FF88' },
    sceneTitles: true, autoSfx: true, filmFinish: { intensity: 'subtle' },
    label: '科技評測', blurb: '霓虹 cyber＋史詩 BGM＋綠色高亮＋微膠片感',
  },
  // 生活 vlog：溫暖 film 底片調色＋慵懶 BGM＋柔和字幕＋膠片感＝抒情/日常/vlog。
  vlog: {
    id: 'vlog',
    gradeStyle: 'film',
    bgmMood: 'chill',
    subStyle: { segment: true, highlight: false, plate: false, fontKind: 'bold' },
    seams: { withinScene: 0.35, sceneChange: 0.6, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['whoosh', 'ding'],
    memeCaptions: false,
    cards: { intro: true, outro: true, cta: '一起把日子過好，追蹤我', accent: '#FF8A5B' },
    filmFinish: { intensity: 'subtle' },
    label: '生活 Vlog', blurb: '溫暖底片感＋慵懶 BGM＋柔和字幕＋膠片質感',
  },
  // 新聞快報：冷冽 cool 調色＋緊張 BGM＋紅色高亮＋底板字幕（清楚權威）＋章節＋轉場音效。
  'news-brief': {
    id: 'news-brief',
    gradeStyle: 'cool',
    bgmMood: 'tense',
    subStyle: { segment: true, highlight: true, highlightColor: '#FF4D4D', plate: true, fontKind: 'bold' },
    seams: { withinScene: 0.2, sceneChange: 0.4, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['ding', 'whoosh', 'sting'],
    memeCaptions: false,
    cards: { intro: true, outro: true, cta: '追蹤掌握第一手', accent: '#FF4D4D' },
    sceneTitles: true, autoSfx: true,
    label: '新聞快報', blurb: '冷冽權威＋紅色高亮＋底板字幕＋章節，快而清楚',
  },
  // 說故事／懸疑：noir 黑色電影感＋低落 BGM＋襯線字幕（文藝）＋膠片感＋章節。
  'story-time': {
    id: 'story-time',
    gradeStyle: 'noir',
    bgmMood: 'somber',
    subStyle: { segment: true, highlight: false, fontKind: 'serif' },
    seams: { withinScene: 0.4, sceneChange: 0.7, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['drone', 'sting', 'riser'],
    memeCaptions: false,
    cards: { intro: true, outro: true, cta: '故事還沒完，追蹤我', accent: '#C9A227' },
    sceneTitles: true, filmFinish: { intensity: 'subtle' },
    label: '說故事／懸疑', blurb: '黑色電影感＋襯線字幕＋低沉配樂＋膠片質感',
  },
  // 教學步驟：clean 明亮＋慵懶 BGM＋藍色高亮＋底板字幕（步驟清楚）＋章節（每步一段）＋轉場音效。
  tutorial: {
    id: 'tutorial',
    gradeStyle: 'clean',
    bgmMood: 'chill',
    subStyle: { segment: true, highlight: true, highlightColor: '#4DA6FF', plate: true, fontKind: 'bold' },
    seams: { withinScene: 0.3, sceneChange: 0.5, sceneChangeTransition: 'fadeblack' },
    sfxSuggested: ['ding', 'whoosh', 'rimshot'],
    memeCaptions: false,
    cards: { intro: true, outro: true, cta: '學會了嗎？訂閱看更多教學', accent: '#4DA6FF' },
    sceneTitles: true, autoSfx: true,
    label: '教學步驟', blurb: '乾淨明亮＋藍色高亮＋底板字幕＋章節，步驟一目了然',
  },
};

/** 所有模板 id（供選單/驗證用，單一來源）。 */
export const STYLE_PRESET_IDS = Object.keys(STYLE_PRESETS) as StylePresetId[];

/** 依 id 取風格預設；未知 / 未設定回 undefined（呼叫端 fallback 既有行為 = 零回歸）。 */
export function getStylePreset(id?: string | null): StylePreset | undefined {
  return id ? STYLE_PRESETS[id as StylePresetId] : undefined;
}
