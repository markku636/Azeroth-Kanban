import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export interface ProgressEvent {
  projectId: string;
  shotId?: string;
  /** 場景級生成時帶上：assemble/scene-done 屬於哪一幕（讓前端只刷新該幕的預覽） */
  sceneId?: string;
  stage: string; // plan | gate | keyframe | voice | video | assemble | done | scene-done | error
  pct?: number;
  status?: string;
  message?: string;
}

function channel(projectId: string): string {
  return `studio:proj:${projectId}`;
}

// 單一全域快照鍵：GPU 一次只跑一鏡（worker concurrency=1），所以「最後一筆進度」就是 GPU 現在在幹嘛。
// 佇列頁不必逐專案訂閱 SSE，直接讀這把鍵即可。TTL 120s → worker 掛了會自動過期成「閒置」。
const CURRENT_KEY = 'studio:current';
const CURRENT_TTL = 120;

export type CurrentProgress = ProgressEvent & { at: number };

// globalThis 快取：Next dev HMR 重評估模組時不要再開一條 publish 連線（module-level let 撐不過 HMR）。
const pubG = globalThis as unknown as { __studioPub?: IORedis };
function pubClient(): IORedis {
  return (pubG.__studioPub ??= new IORedis(REDIS_URL, { maxRetriesPerRequest: null }));
}

export async function publishProgress(e: ProgressEvent): Promise<void> {
  try {
    const c = pubClient();
    await c.publish(channel(e.projectId), JSON.stringify(e));
    // 同步寫全域快照（best-effort）；'set' 不會讓連線進入 subscriber 模式，可與 publish 共用。
    await c.set(CURRENT_KEY, JSON.stringify({ ...e, at: Date.now() }), 'EX', CURRENT_TTL);
  } catch {
    /* progress is best-effort; never fail a generation step on a publish error */
  }
}

/** 讀全域進度快照（佇列頁用來顯示 GPU 現在跑到哪一鏡、哪個階段、幾 %）。 */
export async function getCurrentProgress(): Promise<CurrentProgress | null> {
  try {
    const raw = await pubClient().get(CURRENT_KEY);
    return raw ? (JSON.parse(raw) as CurrentProgress) : null;
  } catch {
    return null;
  }
}

/** Subscribe to a project's progress stream. Returns an unsubscribe fn. */
export function subscribeProgress(projectId: string, onMessage: (e: ProgressEvent) => void): () => void {
  const sub = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  void sub.subscribe(channel(projectId));
  sub.on('message', (_ch, msg) => {
    try {
      onMessage(JSON.parse(msg) as ProgressEvent);
    } catch {
      /* ignore malformed */
    }
  });
  return () => {
    void sub.quit();
  };
}
