'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import { PiXBold, PiSpeakerHighBold, PiStarFill, PiUserBold, PiSparkleFill, PiPaintBrushBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';
import { useConfirm } from '@/hooks/use-confirm';
import { DropZone } from '../../_components/drop-zone';

export interface CharacterDto {
  id: string; name: string; kind: string | null; persona: string | null; appearance: string | null;
  sealSpeaker: string | null; ttsEngine: string | null; loraScale: number | null; voiceInstruct: string | null;
  refImages: unknown; faceIdRef: string | null; isArchived: boolean;
}

// 魔法棒可選的 Google (Vertex) 模型；只是 UX 下拉，真正白名單在後端 character-assist.ts。
// 預設 gemini-flash-latest（永遠跟著 Google 最新 flash）。
const WAND_MODELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'gemini-flash-latest', label: 'gemini-flash-latest（預設）' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
];

type WandField = 'persona' | 'appearance' | 'voiceInstruct';

/** 角色庫的新增／編輯 Modal。建立後可上傳形象圖（FaceID 主圖）與試聽語音。 */
export function CharacterEditModal({
  character,
  onClose,
  onSaved,
}: {
  character?: CharacterDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [id, setId] = useState<string | null>(character?.id ?? null);
  const isCreate = !id;

  const [name, setName] = useState(character?.name ?? '');
  const [kind, setKind] = useState(character?.kind ?? '');
  const [persona, setPersona] = useState(character?.persona ?? '');
  const [appearance, setAppearance] = useState(character?.appearance ?? '');
  const [sealSpeaker, setSealSpeaker] = useState(character?.sealSpeaker ?? '');
  const [ttsEngine, setTtsEngine] = useState(character?.ttsEngine ?? '');
  const [loraScale, setLoraScale] = useState(character?.loraScale != null ? String(character.loraScale) : '');
  const [voiceInstruct, setVoiceInstruct] = useState(character?.voiceInstruct ?? '');
  const [setPrimary, setSetPrimary] = useState(true);
  const refCount0 = Array.isArray(character?.refImages) ? (character!.refImages as unknown[]).length : 0;
  const [refCount, setRefCount] = useState(refCount0);
  const [hasAvatar, setHasAvatar] = useState(Boolean(character?.faceIdRef || refCount0 > 0));
  const [avatarBust, setAvatarBust] = useState('');

  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 魔法棒（Gemini Vertex 優化）：vertexReady 控制顯示、wandModel 為下拉選的模型、
  // wandBusy 標記哪一欄優化中（per-field spinner + 並發鎖）。
  const [vertexReady, setVertexReady] = useState(false);
  const [wandModel, setWandModel] = useState('gemini-flash-latest');
  const [wandBusy, setWandBusy] = useState<WandField | null>(null);
  const [genBusy, setGenBusy] = useState(false); // AI 生成形象圖中

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/studio/config');
        const j = await res.json().catch(() => ({}));
        if (res.ok && j.data) setVertexReady(Boolean(j.data.providers?.vertex));
      } catch {
        /* 取不到設定就維持停用 */
      }
    })();
  }, []);

  const optimize = async (field: WandField) => {
    const cur = field === 'persona' ? persona : field === 'appearance' ? appearance : voiceInstruct;
    setWandBusy(field);
    try {
      const res = await fetch('/api/v1/studio/characters/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, text: cur, name, persona, appearance, model: wandModel }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.data?.text) throw new Error(j.message ?? 'AI 優化失敗');
      if (field === 'persona') setPersona(j.data.text);
      else if (field === 'appearance') setAppearance(j.data.text);
      else setVoiceInstruct(j.data.text);
      toast.success('已用 AI 優化，請檢視後儲存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 優化失敗');
    }
    setWandBusy(null);
  };

  const wandBtn = (field: WandField) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void optimize(field)}
      isLoading={wandBusy === field}
      disabled={wandBusy !== null || busy}
      title="用 Gemini 優化此欄位"
      className="border-purple-300 text-purple-700 hover:border-purple-400 hover:text-purple-800 dark:border-purple-700 dark:text-purple-300"
    >
      <PiSparkleFill className="me-1 h-3.5 w-3.5" /> {wandBusy === field ? '優化中…' : '優化'}
    </Button>
  );

  const body = () => ({
    name: name.trim(),
    kind: kind.trim(),
    persona: persona.trim(),
    appearance: appearance.trim(),
    sealSpeaker: sealSpeaker.trim(),
    ttsEngine: ttsEngine.trim(),
    loraScale: loraScale.trim() ? Number(loraScale) : undefined,
    voiceInstruct: voiceInstruct.trim(),
  });

  const save = async (close = true) => {
    if (!name.trim()) { toast.error('請輸入角色名稱'); return; }
    setBusy(true);
    try {
      const res = await fetch(id ? `/api/v1/studio/characters/${id}` : '/api/v1/studio/characters', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? '儲存失敗');
      onSaved();
      if (!id && j.data?.id) {
        setId(j.data.id);
        toast.success('角色已建立，可上傳形象圖 / 試聽語音');
        setBusy(false);
        return; // 建立後留在 Modal 讓使用者上傳圖
      }
      toast.success('已儲存');
      if (close) { onClose(); return; }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '儲存失敗');
    }
    setBusy(false);
  };

  const upload = async (files: File[]) => {
    if (!id || files.length === 0) return;
    // 先擋大小（伺服器上限 20MB／張）→ 略過超大圖、其餘照傳，不必整批等到伺服器才退。
    const ok = files.filter((f) => f.size <= 20 * 1024 * 1024);
    if (ok.length < files.length) toast.error(`${files.length - ok.length} 張圖超過 20MB，已略過`);
    if (ok.length === 0) return;
    setBusy(true);
    try {
      for (const f of ok) {
        const fd = new FormData(); fd.append('file', f); if (setPrimary) fd.append('primary', '1');
        const res = await fetch(`/api/v1/studio/characters/${id}/reference`, { method: 'POST', body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message ?? '上傳失敗');
        setRefCount((n) => n + 1);
      }
      setHasAvatar(true); setAvatarBust(String(Date.now()));
      onSaved();
      toast.success('已上傳形象圖');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上傳失敗');
    }
    setBusy(false);
  };

  const generateAvatar = async () => {
    if (!id) return;
    if (!appearance.trim()) { toast.error('請先填外觀描述（可按右側「優化」鈕）再生成形象圖'); return; }
    setGenBusy(true);
    const before = refCount;
    try {
      // worker 生圖讀的是 DB 的 appearance → 先把目前外觀存起來再排程
      await fetch(`/api/v1/studio/characters/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
      const res = await fetch(`/api/v1/studio/characters/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? '生成失敗');
      toast.success('已排入生成，約 30–60 秒…');
      const t0 = Date.now();
      let done = false;
      while (Date.now() - t0 < 180000) {
        await new Promise((r) => setTimeout(r, 4000));
        const cr = await fetch(`/api/v1/studio/characters/${id}`);
        const cj = await cr.json().catch(() => ({}));
        const cnt = Array.isArray(cj.data?.refImages) ? cj.data.refImages.length : 0;
        if (cnt > before) {
          setRefCount(cnt); setHasAvatar(true); setAvatarBust(String(Date.now())); onSaved();
          toast.success('角色形象圖已生成'); done = true; break;
        }
      }
      if (!done) toast.error('生成逾時，請確認 ComfyUI 已啟動後再試');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失敗');
    }
    setGenBusy(false);
  };

  const preview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch('/api/v1/studio/tts/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker: sealSpeaker.trim() || 'default', loraScale: loraScale.trim() ? Number(loraScale) : undefined, engine: ttsEngine.trim() || undefined, instruct: voiceInstruct.trim() || undefined }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '試聽失敗'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) { audioRef.current.src = url; await audioRef.current.play().catch(() => {}); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '試聽失敗');
    }
    setPreviewing(false);
  };

  const del = async () => {
    if (!id) return;
    const ok = await confirm({ title: '封存角色', message: `確定封存「${name}」？已指派此角色的分鏡不受影響；之後可在角色庫顯示封存項目還原。`, type: 'danger', confirmLabel: '封存' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/characters/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '封存失敗'); }
      toast.success('角色已封存'); onSaved(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '封存失敗'); setBusy(false);
    }
  };

  const avatarSrc = id ? `/api/v1/studio/characters/${id}/avatar${avatarBust ? `?v=${avatarBust}` : ''}` : '';

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{isCreate ? '新增角色' : `編輯角色 · ${name}`}</h3>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 hover:text-gray-600"><PiXBold className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
          {/* 形象圖 */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-200">
              {id && hasAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt={name} className="h-full w-full object-cover" onError={() => setHasAvatar(false)} />
              ) : (
                <PiUserBold className="h-10 w-10 text-gray-300" />
              )}
            </div>
            <div className="text-xs text-gray-400">{refCount > 0 ? `參考圖 ${refCount} 張` : '尚無形象圖'}</div>
          </div>

          {/* 基本資料 */}
          <div className="space-y-3">
            <Input label="角色名稱" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：長大的小智" />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">角色類型</label>
              <select
                aria-label="角色類型"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                title="人類=真人角色（走 FaceID 一致臉）；生物=非人生物（怪物／動物／精靈等）。空=未指定（沿用舊行為）"
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50"
              >
                <option value="">未指定（預設）</option>
                <option value="human">人類</option>
                <option value="creature">生物</option>
              </select>
            </div>

            {/* 🪄 魔法棒：選 Google 模型；未設定 Vertex 時整列隱藏改顯示提示 */}
            {vertexReady ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-purple-200 bg-purple-50/40 px-2.5 py-1.5 text-xs text-purple-700 dark:border-purple-900 dark:bg-purple-950/20 dark:text-purple-300">
                <span className="flex items-center gap-1 font-medium"><PiSparkleFill className="h-3.5 w-3.5" /> AI 優化模型</span>
                <select
                  aria-label="AI 優化模型"
                  value={wandModel}
                  onChange={(e) => setWandModel(e.target.value)}
                  disabled={wandBusy !== null}
                  className="rounded-md border border-gray-300 bg-background px-2 py-1 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {WAND_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <span className="text-gray-400">按各欄位的「優化」鈕改寫描述</span>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-gray-200 px-2.5 py-1.5 text-xs text-gray-500">
                AI 優化未啟用：請於後端設定 Vertex 憑證（<code>GOOGLE_VERTEX_PROJECT</code> 與 <code>GOOGLE_VERTEX_CREDENTIALS</code>）。
              </p>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">個性／背景（餵 AI 保持一致）</span>
                {vertexReady && wandBtn('persona')}
              </div>
              <Textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={2} placeholder="性格、動機、說話風格…" textareaClassName="resize-none" />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">外觀描述（英文，供 SDXL 一致性）</span>
                {vertexReady && wandBtn('appearance')}
              </div>
              <Textarea value={appearance} onChange={(e) => setAppearance(e.target.value)} rows={2} placeholder="e.g. middle-aged man, red and white cap, greying spiky hair" textareaClassName="resize-none" />
            </div>
          </div>
        </div>

        {/* 形象圖上傳（建立後可用） */}
        <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-3 dark:border-gray-300">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><PiStarFill className="h-3.5 w-3.5 text-amber-400" /> 形象圖（上傳或 AI 生成，FaceID 一致臉）</span>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={setPrimary} onChange={(e) => setSetPrimary(e.target.checked)} className="rounded" /> 設為主形象圖
            </label>
          </div>
          {id ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-gray-500">用 AI 依「外觀描述」生成形象圖，或自行上傳</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void generateAvatar()}
                  isLoading={genBusy}
                  disabled={genBusy || busy}
                  title="用 ComfyUI 依外觀描述生成角色形象圖（需 ComfyUI 已啟動）"
                  className="border-emerald-300 text-emerald-700 hover:border-emerald-400 hover:text-emerald-800 dark:border-emerald-700 dark:text-emerald-300"
                >
                  <PiPaintBrushBold className="me-1.5 h-3.5 w-3.5" /> {genBusy ? '生成中…' : 'AI 生成形象圖'}
                </Button>
              </div>
              <DropZone onFiles={upload} multiple disabled={busy || genBusy} hint="png / jpg / webp，單張 ≤ 20MB；主形象圖會用於分鏡的 FaceID 重繪" />
            </div>
          ) : (
            <p className="text-xs text-gray-400">先按下方「建立角色」，建立後即可上傳或 AI 生成形象圖。</p>
          )}
        </div>

        {/* 語音設定 */}
        <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-3 dark:border-gray-300">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><PiSpeakerHighBold className="h-3.5 w-3.5" /> 語音（Seal-TTS / cosyvoice3）</span>
            <Button size="sm" variant="outline" onClick={() => void preview()} isLoading={previewing} disabled={previewing} className="border-sky-300 text-sky-700 hover:border-sky-400 hover:text-sky-800 dark:border-sky-700 dark:text-sky-300">
              <PiSpeakerHighBold className="me-1.5 h-3.5 w-3.5" /> {previewing ? '合成中…' : '試聽'}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Speaker（TTS 聲線 id）" value={sealSpeaker} onChange={(e) => setSealSpeaker(e.target.value)} placeholder="如：彭總" variant="flat" />
            <Input label="引擎（預設 cosyvoice3）" value={ttsEngine} onChange={(e) => setTtsEngine(e.target.value)} placeholder="cosyvoice3" variant="flat" />
            <Input type="number" step="0.05" min="0" max="1" label="lora_scale (0–1)" value={loraScale} onChange={(e) => setLoraScale(e.target.value)} placeholder="0.0" variant="flat" />
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">預設語氣 instruct（可被分鏡 emotion 覆寫）</span>
                {vertexReady && wandBtn('voiceInstruct')}
              </div>
              <Input value={voiceInstruct} onChange={(e) => setVoiceInstruct(e.target.value)} placeholder="如：厭世吐槽" variant="flat" />
            </div>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} hidden />
        </div>

        <div className="mt-6 flex items-center justify-between">
          {isCreate ? <span /> : (
            <Button variant="outline" color="danger" onClick={() => void del()} disabled={busy}>封存</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>{isCreate ? '取消' : '完成'}</Button>
            <Button onClick={() => void save(!isCreate)} isLoading={busy} disabled={busy || !name.trim()} className="bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-700">
              {isCreate ? '建立角色' : '儲存'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
