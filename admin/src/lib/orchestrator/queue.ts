import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// globalThis 快取（比照 prisma.ts）：避免 Next dev HMR 重新評估模組時，舊的 ioredis 連線/Queue
// 沒被關閉就再開一條，造成 FD 洩漏。production 走單例正常路徑。
const g = globalThis as unknown as { __studioConn?: IORedis; __studioQueue?: Queue<PipelineJob> };

// BullMQ needs maxRetriesPerRequest = null on the shared connection.
const rawConnection = (g.__studioConn ??= new IORedis(REDIS_URL, { maxRetriesPerRequest: null }));
// Cast: the app's ioredis version vs bullmq's bundled ioredis types differ structurally.
export const connection = rawConnection as unknown as ConnectionOptions;

export const PIPELINE_QUEUE = 'studio-pipeline';

export interface PipelineJob {
  projectId: string;
  /** when true, resume from the checkpoint with resumeValue (e.g. storyboard approval / retake) */
  resume?: boolean;
  resumeValue?: unknown;
  /**
   * Staged generation (crash-safe, one-shot-at-a-time, bypasses the LangGraph checkpoint flow):
   *  - 'keyframes' → generate only the keyframe images (review before video)
   *  - 'render'    → voice + video for the targets, then assemble the whole project
   * When absent, the legacy full LangGraph run/resume is used.
   */
  mode?: 'keyframes' | 'render' | 'export' | 'refine' | 'character';
  /** target shot ids for staged modes; empty/absent = all shots in the project */
  shotIds?: string[];
  /** 'character' 模式：用角色 appearance（+可選補充）以 SDXL 生成角色形象圖，存進角色庫並設為 FaceID 主圖。 */
  character?: { characterId: string; prompt?: string };
  /** 'export' 模式：把成片 final.mp4 轉檔成可下載格式（gif｜webm）。 */
  exportFormat?: 'gif' | 'webm';
  /**
   * 'refine' 模式（洗圖）：在現有關鍵幀上做 img2img 微調或 inpaint 局部重繪，產生「新版本」記入歷史，
   * 但不覆蓋現役關鍵幀（使用者比較前後後再 select）。一次一鏡。
   */
  refine?: {
    shotId: string;
    refineMode: 'img2img' | 'inpaint';
    /** 微調指令（追加到畫面描述後當 prompt）；可空（純重骰該區域） */
    instruction?: string;
    /** 0..1 重繪幅度；img2img 預設 0.45、inpaint 預設 0.9 */
    denoise?: number;
    /** 以哪個歷史版本當基底；省略 = 現役 keyframe.png */
    baseVersionId?: string;
    /** inpaint 遮罩 PNG 的絕對路徑（白=改、黑=留）；省略 = 走整張 img2img */
    maskPath?: string;
  };
  /**
   * 'render' 模式：只生成並合成「這一幕」的影片，輸出到 scenes/<sceneId>/final.mp4
   * （而非整支 output/final.mp4）。給定時 shotIds 省略 = 該幕全部分鏡。
   */
  sceneId?: string;
}

export const pipelineQueue = (g.__studioQueue ??= new Queue<PipelineJob>(PIPELINE_QUEUE, { connection }));
