'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import { PiXBold, PiUploadSimpleBold, PiImageSquareBold, PiFilmReelBold, PiPlayFill, PiSparkleFill, PiSpeakerHighBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { useConfirm } from '@/hooks/use-confirm';
import { RefineModal } from './refine-modal';

interface EditableShot {
  id: string;
  shotNo: number;
  visual: string | null;
  tts: string | null;
  branch: string;
  status?: string;
  keyframePath?: string | null;
  refImage?: string | null;
  keyframeMode?: string;
  caption?: string | null;
  punchline?: string | null;
  sfx?: string | null;
  punch?: boolean;
  punchAtFrac?: number | null;
  punchZoom?: number | null;
  characterId?: string | null;
  updatedAt?: string;
  hasClip?: boolean;
}

interface ProjectCharLite { characterId: string; character: { name: string } }

/**
 * 分鏡編輯／新增 Modal。
 * - 傳 `shot` → 編輯模式（PATCH，可刪除、可上傳參考圖、可單鏡「① 生圖 / ② 生片」）
 * - 傳 `createSceneId`（含 null）→ 新增模式（POST，一次填好 visual／台詞／分支／喜劇欄位）
 */
export function ShotEditModal({
  projectId,
  shot,
  createSceneId,
  aiEnabled = true,
  onClose,
  onSaved,
}: {
  projectId: string;
  shot?: EditableShot;
  createSceneId?: string | null;
  /** AI 是否可用（後端有設定任一 provider）；false 時新增模式的 Gemini 協助面板停用 */
  aiEnabled?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = !shot;
  const confirm = useConfirm();
  const [visual, setVisual] = useState(shot?.visual ?? '');
  const [tts, setTts] = useState(shot?.tts ?? '');
  const [branch, setBranch] = useState(shot?.branch ?? 'still');
  const [caption, setCaption] = useState(shot?.caption ?? '');
  const [punchline, setPunchline] = useState(shot?.punchline ?? '');
  const [sfx, setSfx] = useState(shot?.sfx || 'none');
  const [punch, setPunch] = useState(shot?.punch ?? false);
  const [punchAtFrac, setPunchAtFrac] = useState(shot?.punchAtFrac != null ? String(shot.punchAtFrac) : '');
  const [punchZoom, setPunchZoom] = useState(shot?.punchZoom != null ? String(shot.punchZoom) : '');
  const [busy, setBusy] = useState(false);
  // 新增模式：Gemini 協助補完（motion/emotion 無對應輸入欄 → 以 state 帶著，新增時一併送出）
  const [motion, setMotion] = useState('');
  const [emotion, setEmotion] = useState('');
  const [assistHint, setAssistHint] = useState('');
  const [assisting, setAssisting] = useState(false);
  // 單鏡欄位魔法棒：標記哪一欄潤飾中（per-field spinner + 並發鎖）。
  type WandField = 'visual' | 'tts' | 'caption' | 'punchline';
  const [wandBusy, setWandBusy] = useState<WandField | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false); // 旁白試聽中
  // 試聽（旁白／音效）共用一個 audio，播新的前先停舊的；關閉 modal 時也停止。
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopPreview = () => { const a = previewAudioRef.current; if (a) { a.pause(); previewAudioRef.current = null; } };
  useEffect(() => () => stopPreview(), []);
  // 角色指派（指派後 speaker/FaceID 連動，由後端 assignCharacterToShot 處理）
  const [characterId, setCharacterId] = useState(shot?.characterId ?? '');
  const [projectChars, setProjectChars] = useState<ProjectCharLite[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/v1/studio/projects/${projectId}/characters`);
        const j = await res.json().catch(() => ({}));
        if (alive && res.ok && Array.isArray(j.data)) setProjectChars(j.data as ProjectCharLite[]);
      } catch { /* 角色清單載入失敗不影響編輯 */ }
    })();
    return () => { alive = false; };
  }, [projectId]);

  // 關鍵幀／成片：預覽 + 圖↔影切換 + 點圖放大
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [refMode, setRefMode] = useState<'upload' | 'faceid'>('upload');
  const [kfBust, setKfBust] = useState('');
  const [imgOk, setImgOk] = useState(Boolean(shot?.keyframePath));
  const [mediaTab, setMediaTab] = useState<'image' | 'video'>('image');
  const [zoom, setZoom] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const hasClip = shot?.hasClip ?? (shot?.status === 'VIDEO' || shot?.status === 'READY');
  // 與看板卡用同一個版本參數（updatedAt），避免兩處快取到不同版本而圖片不一致；上傳後用 kfBust 立即刷新。
  const kfVer = kfBust || (shot?.updatedAt ?? '');
  const kfSrc = `/api/v1/studio/shots/${shot?.id}/keyframe?v=${encodeURIComponent(kfVer)}`;
  const clipSrc = `/api/v1/studio/shots/${shot?.id}/clip?v=${encodeURIComponent(shot?.updatedAt ?? '')}`;
  const modeLabel =
    shot?.keyframeMode === 'upload' ? '上傳圖直接當關鍵幀'
      : shot?.keyframeMode === 'faceid' ? '參考圖重繪（保留人物）'
        : '文生圖（SDXL，由畫面描述生成）';

  // 把目前表單內容存進 DB（不關閉）。回傳是否成功。
  const persist = async (): Promise<boolean> => {
    const comedy = {
      caption: caption.trim(), punchline: punchline.trim(), sfx: sfx === 'none' ? '' : sfx, punch,
      punchAtFrac: punchAtFrac.trim() ? Number(punchAtFrac) : undefined,
      punchZoom: punchZoom.trim() ? Number(punchZoom) : undefined,
    };
    try {
      if (isCreate) {
        const res = await fetch('/api/v1/studio/shots', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // motion/emotion 僅在 Gemini 協助補完後才有值；空字串時不送，避免覆寫
          body: JSON.stringify({ projectId, sceneId: createSceneId ?? null, visual, tts, subtitle: tts, branch, motion: motion || undefined, emotion: emotion || undefined, ...comedy }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message ?? '新增失敗');
        // createShot 不收 characterId → 新增後若選了角色，再 PATCH 指派（連動 speaker/FaceID）。
        const newId = json.data?.id as string | undefined;
        if (newId && characterId) {
          await fetch(`/api/v1/studio/shots/${newId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId }) });
        }
        return true;
      }
      const res = await fetch(`/api/v1/studio/shots/${shot.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        // characterId 只在使用者實際變更時送出，避免每次儲存都重置 speaker/FaceID。
        body: JSON.stringify({ visual, tts, subtitle: tts, branch, ...comedy, ...(characterId !== (shot.characterId ?? '') ? { characterId: characterId || null } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? '更新失敗');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失敗');
      return false;
    }
  };

  const save = async () => {
    setBusy(true);
    if (await persist()) { toast.success(isCreate ? '分鏡已新增' : '已更新'); onSaved(); }
    else setBusy(false);
  };

  // 新增模式：呼叫 Gemini（或選用的 provider）依專案脈絡＋本場已有分鏡＋一句想法，補完這一鏡的所有欄位。
  // persist=false → 只回建議，預填表單讓使用者審核後再按「新增」。
  const assist = async () => {
    setAssisting(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/suggest-shots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId: createSceneId ?? null, hint: assistHint.trim() || undefined, count: 1, persist: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? 'AI 產生失敗');
      const s = json.data?.shots?.[0];
      if (!s) throw new Error('AI 沒有產生分鏡，請換個想法再試');
      setVisual(s.visual ?? '');
      setTts(s.tts ?? '');
      setBranch(s.branch === 'i2v' ? 'i2v' : 'still');
      setMotion(s.motion ?? '');
      setEmotion(s.emotion ?? '');
      setCaption(s.caption ?? '');
      setPunchline(s.punchline ?? '');
      setSfx(s.sfx && s.sfx !== 'none' ? s.sfx : 'none');
      setPunch(Boolean(s.punch));
      setPunchAtFrac(s.punchAtFrac != null ? String(s.punchAtFrac) : '');
      setPunchZoom(s.punchZoom != null ? String(s.punchZoom) : '');
      toast.success('已用 AI 補完，請審核後新增');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 產生失敗');
    }
    setAssisting(false);
  };

  // 單鏡欄位「魔法棒」：用 AI 依故事脈絡＋同鏡其他欄位潤飾這一欄；結果預填讓使用者審核後再儲存（不落庫）。
  const fieldValue = (f: WandField) => (f === 'visual' ? visual : f === 'tts' ? tts : f === 'caption' ? caption : punchline);
  const setFieldValue = (f: WandField, v: string) => {
    if (f === 'visual') setVisual(v); else if (f === 'tts') setTts(v); else if (f === 'caption') setCaption(v); else setPunchline(v);
  };
  const polish = async (field: WandField) => {
    setWandBusy(field);
    try {
      const res = await fetch('/api/v1/studio/shots/polish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, field, text: fieldValue(field), visual, tts, caption, punchline }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? 'AI 潤飾失敗');
      const out = json.data?.text as string | undefined;
      if (!out) throw new Error('AI 沒有產生內容');
      setFieldValue(field, out);
      toast.success('已用 AI 潤飾，請檢視後儲存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 潤飾失敗');
    }
    setWandBusy(null);
  };

  const wandBtn = (field: WandField) => (
    <button
      type="button"
      onClick={() => void polish(field)}
      disabled={wandBusy !== null || busy}
      title="用 AI 潤飾此欄位（依故事脈絡改寫，會預填讓你審核）"
      className="flex items-center gap-1 rounded-md border border-purple-300 px-2 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:border-purple-400 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/20"
    >
      <PiSparkleFill className="h-3 w-3" /> {wandBusy === field ? '潤飾中…' : '潤飾'}
    </button>
  );

  // 試聽旁白：先存目前編輯（讓試聽反映剛改的台詞/情緒/角色），再用與生成相同的聲音設定合成並播放。
  const previewVoice = async () => {
    if (!shot || !tts.trim()) return;
    setVoiceBusy(true);
    try {
      if (!(await persist())) { setVoiceBusy(false); return; }
      const res = await fetch(`/api/v1/studio/shots/${shot.id}/preview-voice`, { method: 'POST' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '試聽失敗'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      stopPreview();
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); if (previewAudioRef.current === audio) previewAudioRef.current = null; };
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '試聽失敗');
    }
    setVoiceBusy(false);
  };

  // 先存目前編輯，再排入單鏡生成（① 生圖 / ② 生片），關閉後在看板看進度。
  const genThis = async (kind: 'keyframes' | 'render') => {
    if (!shot) return;
    // 生片前若這一鏡還沒關鍵幀 → 會生出沒畫面的片，先提醒（與看板整支生成的前置檢查一致）。
    if (kind === 'render' && !imgOk) {
      const ok = await confirm({ title: '尚無關鍵幀', message: '這一鏡還沒有關鍵幀圖片，直接生片可能沒有畫面。建議先按「① 生圖」。仍要生片嗎？', confirmLabel: '仍要生片' });
      if (!ok) return;
    }
    setBusy(true);
    if (!(await persist())) { setBusy(false); return; }
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shotIds: [shot.id] }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '排入失敗'); }
      toast.success(kind === 'keyframes' ? '已排入生成此鏡圖片' : '已排入生成此鏡影片');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '排入失敗');
      setBusy(false);
    }
  };

  const uploadRef = async (file: File) => {
    if (!shot) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('mode', refMode);
      const res = await fetch(`/api/v1/studio/shots/${shot.id}/reference`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? '上傳失敗');
      toast.success(j.message ?? '已上傳');
      setImgOk(true); setKfBust(String(Date.now())); setMediaTab('image');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上傳失敗');
    }
    setBusy(false);
  };

  const del = async () => {
    if (!shot) return;
    const ok = await confirm({ title: '刪除分鏡', message: `確定刪除分鏡 #${shot.shotNo}？此操作無法復原。`, type: 'danger', confirmLabel: '刪除' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/shots/${shot.id}`, { method: 'DELETE' });
      if (!res.ok) { const json = await res.json().catch(() => ({})); throw new Error(json.message ?? '刪除失敗'); }
      toast.success('分鏡已刪除');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '刪除失敗');
      setBusy(false);
    }
  };

  const canSave = !busy && (visual.trim() !== '' || tts.trim() !== '' || caption.trim() !== '');

  return (
    <>
    <Modal isOpen onClose={onClose} size="lg">
      <div
        className="max-h-[85vh] overflow-y-auto p-5"
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter 從任一輸入框快速儲存（編輯多鏡時加速）。
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSave) { e.preventDefault(); void save(); }
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {isCreate ? '新增分鏡' : `編輯分鏡 #${shot.shotNo}`}
          </h3>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 hover:text-gray-600">
            <PiXBold className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {!isCreate && (
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-300">
              {/* 圖 / 影 切換 */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-200">
                  <button
                    type="button"
                    onClick={() => setMediaTab('image')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaTab === 'image' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-50' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <PiImageSquareBold className="h-4 w-4" /> 圖
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaTab('video')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaTab === 'video' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-50' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <PiPlayFill className={`h-3.5 w-3.5 ${hasClip ? 'text-emerald-500' : ''}`} /> 影{hasClip ? ' ✓' : ''}
                  </button>
                </div>
                <span className="text-xs text-gray-400">{mediaTab === 'image' ? modeLabel : hasClip ? '已生成影片' : '尚未生成影片'}</span>
              </div>

              {mediaTab === 'image' ? (
                <div className="flex gap-3">
                  {imgOk ? (
                    <button type="button" onClick={() => setZoom(true)} className="flex-none" title="點擊放大檢視">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={kfSrc}
                        alt="關鍵幀預覽"
                        className="h-28 w-20 cursor-zoom-in rounded border border-gray-200 object-cover transition-opacity hover:opacity-90 dark:border-gray-300"
                        onError={() => setImgOk(false)}
                      />
                    </button>
                  ) : (
                    <div className="flex h-28 w-20 flex-none items-center justify-center rounded border border-dashed border-gray-300 text-center text-[10px] text-gray-400">尚無圖</div>
                  )}
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                      <label className="flex items-center gap-1"><input type="radio" name="refmode" checked={refMode === 'upload'} onChange={() => setRefMode('upload')} /> 直接當關鍵幀</label>
                      <label className="flex items-center gap-1"><input type="radio" name="refmode" checked={refMode === 'faceid'} onChange={() => setRefMode('faceid')} /> 參考重繪</label>
                    </div>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadRef(f); e.currentTarget.value = ''; }} />
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                      <PiUploadSimpleBold className="me-1.5 h-3.5 w-3.5" /> 上傳參考圖
                    </Button>
                    {imgOk && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRefineOpen(true)}
                        disabled={busy}
                        className="border-violet-300 text-violet-700 hover:border-violet-400 hover:text-violet-800 dark:border-violet-700 dark:text-violet-300"
                      >
                        <PiSparkleFill className="me-1.5 h-3.5 w-3.5" /> 洗圖（微調這張）
                      </Button>
                    )}
                  </div>
                </div>
              ) : hasClip ? (
                /* eslint-disable-next-line jsx-a11y/media-has-caption */
                <video
                  src={clipSrc}
                  controls
                  preload="metadata"
                  className="max-h-72 w-full rounded bg-black"
                />
              ) : (
                <div className="flex h-28 items-center justify-center rounded border border-dashed border-gray-300 text-center text-xs text-gray-400">
                  尚未生成影片 — 按下方「② 生片」生成
                </div>
              )}

              {/* 動作列（永遠顯示）：① 生圖 / ② 生片 */}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void genThis('keyframes')} disabled={busy} className="flex-1 border-sky-300 text-sky-700 hover:border-sky-400 hover:text-sky-800 dark:border-sky-700 dark:text-sky-300">
                  <PiImageSquareBold className="me-1 h-3.5 w-3.5" /> ① 生圖
                </Button>
                <Button size="sm" onClick={() => void genThis('render')} disabled={busy} className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 dark:hover:bg-emerald-700">
                  <PiFilmReelBold className="me-1 h-3.5 w-3.5" /> ② 生片
                </Button>
              </div>
            </div>
          )}

          {isCreate && (
            <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/40 p-3 dark:border-purple-900 dark:bg-purple-950/20">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-purple-700 dark:text-purple-300">
                <PiSparkleFill className="h-4 w-4" /> Gemini 協助補完
              </div>
              {aiEnabled ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={assistHint}
                    onChange={(e) => setAssistHint(e.target.value)}
                    placeholder="一句想法（可留空，AI 會依專案與本場已有分鏡接續）"
                    variant="flat"
                    disabled={assisting || busy}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void assist()}
                    isLoading={assisting}
                    disabled={assisting || busy}
                    className="self-start border-purple-300 text-purple-700 hover:border-purple-400 hover:text-purple-800 dark:border-purple-700 dark:text-purple-300"
                  >
                    <PiSparkleFill className="me-1.5 h-3.5 w-3.5" /> {assisting ? '產生中…' : '用 AI 補完這一鏡'}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  AI 未啟用：請於後端設定 <code>LLM_PROVIDER=vertex</code> 與 Vertex 憑證（或 <code>ANTHROPIC_API_KEY</code>）。
                </p>
              )}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">畫面描述（visual，英文給 SDXL）</span>
              {aiEnabled && wandBtn('visual')}
            </div>
            <Textarea
              value={visual}
              onChange={(e) => setVisual(e.target.value)}
              rows={3}
              placeholder="e.g. a middle-aged Ash sitting on a couch, cinematic lighting"
              textareaClassName="ring-0"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">旁白／台詞（tts，繁中）</span>
              <div className="flex items-center gap-1.5">
                {!isCreate && (
                  <button
                    type="button"
                    onClick={() => void previewVoice()}
                    disabled={voiceBusy || busy || !tts.trim()}
                    title="用實際聲音設定（角色語音＋情緒）試聽這句旁白；需 TTS 服務運作中"
                    className="flex items-center gap-1 rounded-md border border-sky-300 px-2 py-0.5 text-xs font-medium text-sky-700 transition-colors hover:border-sky-400 hover:bg-sky-50 disabled:opacity-40 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/20"
                  >
                    <PiSpeakerHighBold className="h-3 w-3" /> {voiceBusy ? '合成中…' : '試聽'}
                  </button>
                )}
                {aiEnabled && wandBtn('tts')}
              </div>
            </div>
            <Textarea
              value={tts}
              onChange={(e) => setTts(e.target.value)}
              rows={2}
              placeholder="這句會用來配音，並作為字幕"
              textareaClassName="ring-0"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">動態分支</label>
            <select
              aria-label="動態分支"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="still">靜態 Ken-Burns（still，快）</option>
              <option value="lip">對嘴數字人（lip，會說話）</option>
              <option value="i2v">動態生成（i2v，慢但會動）</option>
            </select>
          </div>

          {projectChars.length > 0 ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">角色（指派後自動套用語音與 FaceID 一致臉）</label>
              <select
                aria-label="角色"
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">無（不指派角色）</option>
                {projectChars.map((pc) => <option key={pc.characterId} value={pc.characterId}>{pc.character.name}</option>)}
              </select>
            </div>
          ) : null}

          <div className="rounded-lg border border-dashed border-gray-200 p-3 dark:border-gray-300">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">🎬 喜劇（迷因吐槽，可留空）</span>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={punch} onChange={(e) => setPunch(e.target.checked)} className="rounded" />
                反轉鏡（punch-zoom）
              </label>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700">大字幕（setup）</span>
                  {aiEnabled && wandBtn('caption')}
                </div>
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="鋪陳那句大字，全程顯示" variant="flat" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700">反轉下字幕（punchline）</span>
                  {aiEnabled && wandBtn('punchline')}
                </div>
                <Input value={punchline} onChange={(e) => setPunchline(e.target.value)} placeholder="反轉爆點，會在反轉點彈出（黃字）" variant="flat" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-gray-700">卡點音效</label>
                  {sfx !== 'none' && (
                    <button
                      type="button"
                      onClick={() => { stopPreview(); const a = new Audio(`/api/v1/studio/sfx/${sfx}`); previewAudioRef.current = a; a.play().catch(() => toast.error('音效試聽失敗')); }}
                      title="試聽這個音效"
                      className="flex items-center gap-1 rounded-md border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/20"
                    >
                      <PiSpeakerHighBold className="h-3 w-3" /> 試聽
                    </button>
                  )}
                </div>
                <select
                  aria-label="卡點音效"
                  value={sfx}
                  onChange={(e) => setSfx(e.target.value)}
                  className="w-full rounded-md border-0 bg-muted/70 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-[1.8px] focus:ring-muted-foreground/40"
                >
                  <option value="none">無</option>
                  <option value="vineboom">Vine Boom（低音轟）</option>
                  <option value="scratch">黑膠刮盤</option>
                  <option value="rimshot">ba-dum-tss</option>
                  <option value="ding">叮！</option>
                  <option value="whoosh">咻～</option>
                  <option value="boing">彈簧 boing</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" step="0.05" min="0" max="1" label="反轉點 (0–1)" value={punchAtFrac} onChange={(e) => setPunchAtFrac(e.target.value)} placeholder="0.55" variant="flat" />
                <Input type="number" step="0.1" min="1" label="放大倍率" value={punchZoom} onChange={(e) => setPunchZoom(e.target.value)} placeholder="1.9" variant="flat" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {isCreate ? (
            <span />
          ) : (
            <Button variant="outline" color="danger" onClick={() => void del()} disabled={busy}>
              刪除
            </Button>
          )}
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-gray-400 sm:inline">⌘/Ctrl + Enter 儲存</span>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button onClick={() => void save()} isLoading={busy} disabled={!canSave} className="bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-700">
              {isCreate ? '新增' : '儲存'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>

    {/* 點圖放大 lightbox */}
    {zoom && shot && imgOk && (
      <button
        type="button"
        aria-label="關閉放大檢視"
        onClick={() => setZoom(false)}
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-black/85 p-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={kfSrc} alt={`分鏡 #${shot.shotNo} 關鍵幀`} className="max-h-[85vh] max-w-full rounded object-contain" />
        <span className="text-xs text-white/80">分鏡 #{shot.shotNo} · 點任意處關閉</span>
      </button>
    )}

    {/* 🪄 洗圖工作台：微調 / 局部重繪 / 前後比較 / 挑歷史版本 */}
    {refineOpen && shot && (
      <RefineModal
        shotId={shot.id}
        shotNo={shot.shotNo}
        onClose={() => setRefineOpen(false)}
        onApplied={() => { setKfBust(String(Date.now())); setImgOk(true); setMediaTab('image'); onSaved(); }}
      />
    )}
    </>
  );
}
