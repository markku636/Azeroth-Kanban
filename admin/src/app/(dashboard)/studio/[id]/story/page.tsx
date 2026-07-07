'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import { PiUsersThreeDuotone, PiPlusBold, PiTrashBold, PiArrowSquareOutBold, PiArrowRightBold, PiSparkleFill } from 'react-icons/pi';
import { usePrompt } from '@/hooks/use-prompt';
import { useConfirm } from '@/hooks/use-confirm';

interface CharacterLite { id: string; name: string; isArchived: boolean }
interface ProjectCharacter { id: string; characterId: string; roleInStory: string | null; character: { id: string; name: string } }
interface BibleResp {
  id: string;
  description: string | null; logline: string | null; premise: string | null; worldSetting: string | null;
  styleGuide: string | null; tone: string | null; genre: string | null; targetAudience: string | null; bibleNotes: string | null;
  characters: ProjectCharacter[];
}

const FIELDS = ['description', 'premise', 'logline', 'worldSetting', 'styleGuide', 'tone', 'genre', 'targetAudience', 'bibleNotes'] as const;
type FieldKey = (typeof FIELDS)[number];

// pop-on 預覽的示範短句（循環播放，模擬逐句彈出）
const POP_SAMPLE = ['這顆球', '我收了', '三十年', '終於派上用場'] as const;

export default function StoryPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [title, setTitle] = useState('');
  const [form, setForm] = useState<Record<FieldKey, string>>(() => Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<FieldKey, string>);
  const savedRef = useRef<Record<FieldKey, string>>(Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<FieldKey, string>);
  const [attached, setAttached] = useState<ProjectCharacter[]>([]);
  const [library, setLibrary] = useState<CharacterLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickId, setPickId] = useState('');
  const [pickRole, setPickRole] = useState('');
  const [sub, setSub] = useState<{ fontSize: number; color: string; position: string; segment: boolean; plate: boolean; highlight: boolean; highlightColor: string }>({ fontSize: 42, color: '#FFFFFF', position: 'bottom', segment: false, plate: false, highlight: false, highlightColor: '#FFD400' });
  const [wm, setWm] = useState<{ text: string; position: string }>({ text: '', position: 'tr' });
  const [look, setLookState] = useState<string>('');
  const [pb, setPb] = useState<{ enabled: boolean; color: string; position: string }>({ enabled: false, color: '#FFD400', position: 'bottom' });
  const [sceneTitles, setSceneTitles] = useState(false);
  const [autoSfx, setAutoSfx] = useState(false);
  const [stock, setStock] = useState<{ on: boolean; available: boolean }>({ on: false, available: false });
  const [bgmMood, setBgmMood] = useState<string>('');
  const [hasSubs, setHasSubs] = useState(false);
  const [hasChapters, setHasChapters] = useState(false);
  const [film, setFilm] = useState<{ enabled: boolean; intensity: string }>({ enabled: false, intensity: 'subtle' });
  const [logo, setLogo] = useState<{ hasLogo: boolean; position: string; scale: number }>({ hasLogo: false, position: 'tl', scale: 0.18 });
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const [wandBusy, setWandBusy] = useState<FieldKey | null>(null); // 單欄魔法棒：標記哪一欄潤飾中
  const prompt = usePrompt();
  const confirm = useConfirm();

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/studio/config');
        const j = await res.json();
        if (res.ok && j.data) setAiEnabled(Boolean(j.data.aiEnabled));
      } catch { /* 預設視為可用 */ }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const [bRes, pRes, cRes] = await Promise.all([
        fetch(`/api/v1/studio/projects/${projectId}/bible`),
        fetch(`/api/v1/studio/projects/${projectId}`),
        fetch(`/api/v1/studio/characters`),
      ]);
      const bJson = await bRes.json();
      if (bRes.ok && bJson.data) {
        const b = bJson.data as BibleResp;
        const next = Object.fromEntries(FIELDS.map((f) => [f, b[f] ?? ''])) as Record<FieldKey, string>;
        setForm(next);
        savedRef.current = { ...next };
        setAttached(b.characters ?? []);
      }
      const pJson = await pRes.json().catch(() => ({}));
      if (pRes.ok && pJson.data) {
        setTitle(pJson.data.title ?? '');
        const ss = pJson.data.subtitleStyle as { fontSize?: number; color?: string; position?: string; segment?: boolean; plate?: boolean; highlight?: boolean; highlightColor?: string } | null;
        if (ss && typeof ss === 'object') setSub({ fontSize: typeof ss.fontSize === 'number' ? ss.fontSize : 42, color: typeof ss.color === 'string' ? ss.color : '#FFFFFF', position: ss.position === 'top' || ss.position === 'center' ? ss.position : 'bottom', segment: ss.segment === true, plate: ss.plate === true, highlight: ss.highlight === true, highlightColor: typeof ss.highlightColor === 'string' ? ss.highlightColor : '#FFD400' });
        const wmData = pJson.data.watermark as { text?: string; position?: string } | null;
        if (wmData && typeof wmData === 'object') setWm({ text: typeof wmData.text === 'string' ? wmData.text : '', position: wmData.position === 'tl' || wmData.position === 'bl' || wmData.position === 'br' ? wmData.position : 'tr' });
        setLookState(typeof pJson.data.look === 'string' ? pJson.data.look : '');
        const pbData = pJson.data.progressBar as { enabled?: boolean; color?: string; position?: string } | null;
        if (pbData && typeof pbData === 'object') setPb({ enabled: pbData.enabled === true, color: typeof pbData.color === 'string' ? pbData.color : '#FFD400', position: pbData.position === 'top' ? 'top' : 'bottom' });
        setSceneTitles(pJson.data.sceneTitles === true);
        setAutoSfx(pJson.data.autoSfx === true);
        setStock({ on: pJson.data.stockBroll === true, available: pJson.data.stockBrollAvailable === true });
        setBgmMood(typeof pJson.data.bgmMood === 'string' ? pJson.data.bgmMood : '');
        setHasSubs(pJson.data.hasSubtitles === true);
        setHasChapters(pJson.data.hasChapters === true);
        const ff = pJson.data.filmFinish as { enabled?: boolean; intensity?: string } | null;
        if (ff && typeof ff === 'object') setFilm({ enabled: ff.enabled === true, intensity: ff.intensity === 'strong' ? 'strong' : 'subtle' });
        const lg = pJson.data.watermarkLogo as { hasLogo?: boolean; position?: string; scale?: number } | null;
        if (lg && typeof lg === 'object') setLogo({ hasLogo: lg.hasLogo === true, position: lg.position === 'tr' || lg.position === 'bl' || lg.position === 'br' ? lg.position : 'tl', scale: typeof lg.scale === 'number' ? lg.scale : 0.18 });
      }
      const cJson = await cRes.json().catch(() => ({}));
      if (cRes.ok && Array.isArray(cJson.data)) setLibrary(cJson.data as CharacterLite[]);
    } catch { toast.error('載入故事設定失敗'); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // pop-on 預覽動畫：字幕預覽在 segment 開啟時循環示範短句，讓使用者實際看到「逐句彈出」的效果。
  const [previewIdx, setPreviewIdx] = useState(0);
  useEffect(() => {
    if (!sub.segment) { setPreviewIdx(0); return; }
    const t = setInterval(() => setPreviewIdx((i) => (i + 1) % POP_SAMPLE.length), 900);
    return () => clearInterval(t);
  }, [sub.segment]);

  // AI 助手套用提案後重載故事設定。
  useEffect(() => {
    const h = () => void load();
    window.addEventListener('studio:reload', h);
    return () => window.removeEventListener('studio:reload', h);
  }, [load]);

  const patchBible = async (patch: Partial<Record<FieldKey, string>>) => {
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/bible`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '儲存失敗'); }
    } catch (e) { toast.error(e instanceof Error ? e.message : '儲存失敗'); }
  };

  const saveSub = (next: { fontSize: number; color: string; position: string; segment: boolean; plate: boolean; highlight: boolean; highlightColor: string }) => {
    setSub(next);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subtitleStyle: next }) });
  };
  // 浮水印：text 為空＝送 null（關閉）；否則送設定物件。合併進 spec，改後需重新「生成影片」套用。
  const saveWm = (next: { text: string; position: string }) => {
    setWm(next);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watermark: next.text.trim() ? next : null }) });
  };
  // 調色 look：'' ＝跟隨風格預設（送 null 清除）；否則送 GRADE_STYLES key。改後需重新「生成影片」套用。
  const saveLook = (next: string) => {
    setLookState(next);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ look: next || null }) });
  };
  // 進度條：送完整物件；enabled=false 時後端會移除。改後需重新「生成影片」套用。
  const savePb = (next: { enabled: boolean; color: string; position: string }) => {
    setPb(next);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ progressBar: next }) });
  };
  // 章節標題 lower-third：每個場景第一鏡疊段落標題（用場景的標題）。改後需重新「生成影片」套用。
  const saveSceneTitles = (v: boolean) => {
    setSceneTitles(v);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneTitles: v }) });
  };
  // 自動轉場音效（換場景 whoosh）。改後需重新「生成影片」套用。
  const saveAutoSfx = (v: boolean) => {
    setAutoSfx(v);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoSfx: v }) });
  };
  // stock B-roll：關鍵幀改用 Pexels 圖庫配圖（取代 SDXL）。改後需重新「① 生成圖片」套用。
  const saveStock = (v: boolean) => {
    setStock((s) => ({ ...s, on: v }));
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stockBroll: v }) });
  };
  // BGM 情緒：'' ＝自動（送 null）。改後需重新「生成影片」套用。
  const saveBgmMood = (v: string) => {
    setBgmMood(v);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bgmMood: v || null }) });
  };
  // 電影感收尾：送完整物件；enabled=false 後端會移除。改後需重新「生成影片」套用。
  const saveFilm = (next: { enabled: boolean; intensity: string }) => {
    setFilm(next);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filmFinish: next }) });
  };
  const patchProject = (body: unknown) => fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  // logo：讀檔為 base64 data URI（限 250KB）存進 spec；只改位置/大小時不重送圖（後端沿用既有 src）；移除送 null。
  const onLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 250 * 1024) { toast.error('Logo 檔案請小於 250KB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src.startsWith('data:image/')) { toast.error('請選擇圖片檔'); return; }
      setLogo((prev) => ({ ...prev, hasLogo: true }));
      setLogoPreview(src);
      void patchProject({ watermarkLogo: { src, position: logo.position, scale: logo.scale } });
    };
    reader.readAsDataURL(file);
  };
  const saveLogoOpts = (next: { position: string; scale: number }) => {
    setLogo((prev) => ({ ...prev, ...next }));
    void patchProject({ watermarkLogo: { position: next.position, scale: next.scale } });
  };
  const removeLogo = () => {
    setLogo({ hasLogo: false, position: 'tl', scale: 0.18 }); setLogoPreview('');
    void patchProject({ watermarkLogo: null });
  };
  // key 對應引擎 MOOD_KEYS（此處寫死 label，避免把 music.ts（含 Buffer）拉進 client bundle）。'' ＝自動。
  const BGM_MOODS: { key: string; label: string }[] = [
    { key: '', label: '自動（依題材/情緒）' },
    { key: 'warm', label: '溫暖・勵志' },
    { key: 'epic', label: '史詩・壯闊' },
    { key: 'playful', label: '輕快・搞笑' },
    { key: 'chill', label: '慵懶・日常' },
    { key: 'somber', label: '感傷・療傷' },
    { key: 'tense', label: '緊張・懸疑' },
    { key: 'horror', label: '恐怖・驚悚' },
    { key: 'neutral', label: '中性・平穩' },
  ];
  // key 對應引擎 GRADE_STYLES；css 只是 UI 近似預覽（非精確，實際以 ffmpeg 為準）。'' ＝跟隨風格預設。
  const LOOKS: { key: string; label: string; css: string }[] = [
    { key: '', label: '跟隨風格', css: 'none' },
    { key: 'clean', label: 'Clean 乾淨', css: 'brightness(1.06) contrast(1.08) saturate(1.06)' },
    { key: 'teal', label: 'Teal 電影', css: 'contrast(1.06) saturate(1.12) hue-rotate(-6deg)' },
    { key: 'warm', label: 'Warm 暖調', css: 'sepia(0.18) saturate(1.1) brightness(1.03)' },
    { key: 'cool', label: 'Cool 冷調', css: 'saturate(1.05) hue-rotate(12deg) brightness(1.01)' },
    { key: 'film', label: 'Film 底片', css: 'sepia(0.28) saturate(0.9) contrast(0.95) brightness(1.02)' },
    { key: 'vivid', label: 'Vivid 鮮豔', css: 'saturate(1.4) contrast(1.1)' },
    { key: 'cyber', label: 'Cyber 霓虹', css: 'saturate(1.35) contrast(1.15) hue-rotate(-12deg)' },
    { key: 'dreamy', label: 'Dreamy 夢幻', css: 'brightness(1.07) saturate(0.95) contrast(0.9)' },
    { key: 'mono', label: 'Mono 黑白', css: 'grayscale(1) contrast(1.14)' },
    { key: 'noir', label: 'Noir 黑色', css: 'grayscale(0.55) contrast(1.2)' },
    { key: 'horror', label: 'Horror 驚悚', css: 'grayscale(0.5) contrast(1.25) brightness(0.82)' },
  ];

  const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const saveField = (k: FieldKey) => () => { if (form[k] !== savedRef.current[k]) { savedRef.current[k] = form[k]; void patchBible({ [k]: form[k] }); } };

  const genBible = async () => {
    if (!aiEnabled) { toast('AI 未啟用：請設定 AI 憑證，或手動填寫設定', { icon: '🔒' }); return; }
    let seed = form.description.trim();
    if (!seed) {
      const s = await prompt({ title: 'AI 生成故事設定', message: '給一句題材，我幫你產生前提／世界觀／風格／語氣／類型／受眾', placeholder: '例：長大的小智揹著房貸回到舊街…', confirmLabel: '生成', required: true });
      if (!s) return; seed = s;
    }
    // 已有設定內容 → 重新生成會整份覆蓋（前提/世界觀/風格…），先確認避免誤刪手寫內容（同 R50/R13 footgun）。
    const hasExisting = (['premise', 'logline', 'worldSetting', 'styleGuide', 'tone', 'genre', 'targetAudience', 'bibleNotes'] as FieldKey[]).some((k) => form[k]?.trim());
    if (hasExisting) {
      const ok = await confirm({ title: '重新生成會覆蓋現有設定', message: '目前已有故事設定，AI 重新生成會覆蓋前提／世界觀／風格／語氣／類型／受眾等欄位。要繼續嗎？', type: 'danger', confirmLabel: '重新生成' });
      if (!ok) return;
    }
    setGenBusy(true);
    const t = toast.loading('AI 生成故事設定中…');
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/bible/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? '生成失敗');
      toast.success('已生成故事設定 ✨', { id: t });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '生成失敗', { id: t }); }
    setGenBusy(false);
  };

  // 單欄 AI「潤飾」（非破壞式，只改這一欄）：依其他已填欄位脈絡改寫，預填並即時儲存。
  const polishField = async (field: FieldKey) => {
    setWandBusy(field);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/bible/polish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, text: form[field] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'AI 潤飾失敗');
      const out = j.data?.text as string | undefined;
      if (!out) throw new Error('AI 沒有產生內容');
      setForm((f) => ({ ...f, [field]: out }));
      savedRef.current[field] = out;
      void patchBible({ [field]: out } as Partial<Record<FieldKey, string>>);
      toast.success('已用 AI 潤飾並儲存');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'AI 潤飾失敗'); }
    setWandBusy(null);
  };

  const wandBtn = (field: FieldKey) => (
    <button
      type="button"
      onClick={() => void polishField(field)}
      disabled={wandBusy !== null}
      title="用 AI 潤飾此欄位（依故事脈絡改寫並儲存，不影響其他欄）"
      className="flex items-center gap-1 rounded-md border border-purple-300 px-2 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:border-purple-400 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/20"
    >
      <PiSparkleFill className="h-3 w-3" /> {wandBusy === field ? '潤飾中…' : '潤飾'}
    </button>
  );

  const attachChar = async (characterId: string) => {
    if (!characterId) return;
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/characters`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId, roleInStory: pickRole.trim() || undefined }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '加入失敗'); }
      setPickId(''); setPickRole('');
      toast.success('角色已加入專案');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '加入失敗'); }
  };

  const detachChar = async (characterId: string) => {
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/characters/${characterId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setAttached((a) => a.filter((x) => x.characterId !== characterId));
    } catch { toast.error('移除失敗'); }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" /></div>;
  }

  const attachable = library.filter((c) => !c.isArchived && !attached.some((a) => a.characterId === c.id));
  const filled = FIELDS.filter((f) => form[f].trim()).length;
  const pct = Math.round((filled / FIELDS.length) * 100);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto px-2 py-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">📖 故事設定{title ? ` · ${title}` : ''}</h1>
        <Button variant="outline" onClick={() => void genBible()} isLoading={genBusy} disabled={genBusy} title={aiEnabled ? '用 AI 從一句題材生成整份故事設定' : '需設定 AI 憑證'} className="border-purple-300 text-purple-700 hover:border-purple-400 hover:text-purple-800 dark:border-purple-700 dark:text-purple-300">
          <PiSparkleFill className="me-1.5 h-4 w-4 text-purple-500" /> AI 生成設定
        </Button>
      </div>
      <p className="mb-3 text-sm text-gray-500">這份「故事聖經」是往下所有 AI 生成（腳本→場景→分鏡→提示詞）的單一依據。填得越完整，產出越一致。</p>
      <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
        <span className="flex-none">完成度 {filled}/{FIELDS.length} · {attached.length} 角色</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-200">
          <div className="h-full rounded bg-blue-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* 核心設定 */}
      <section className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">核心設定</h2>
        <Input label="題材／設定" value={form.description} onChange={set('description')} onBlur={saveField('description')} placeholder="這支短片的題材或一句設定…" />
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">核心前提（故事種子）</span>
            {aiEnabled && wandBtn('premise')}
          </div>
          <Textarea value={form.premise} onChange={set('premise')} onBlur={saveField('premise')} rows={3} placeholder="比 logline 更完整的一段：主角是誰、想要什麼、阻礙是什麼…" textareaClassName="resize-none" />
        </div>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">Logline（一句話前提）</span>
            {aiEnabled && wandBtn('logline')}
          </div>
          <Input value={form.logline} onChange={set('logline')} onBlur={saveField('logline')} placeholder="一句話講完整個故事的核心…" />
        </div>
      </section>

      {/* 世界觀與風格 */}
      <section className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">世界觀與風格</h2>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-700">世界觀／背景設定</span>
          {aiEnabled && wandBtn('worldSetting')}
        </div>
        <Textarea value={form.worldSetting} onChange={set('worldSetting')} onBlur={saveField('worldSetting')} rows={3} placeholder="時代、地點、規則、氛圍…AI 會據此維持一致背景。" textareaClassName="resize-none" />
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">風格指南（視覺＋敘事）</span>
            {aiEnabled && wandBtn('styleGuide')}
          </div>
          <Textarea value={form.styleGuide} onChange={set('styleGuide')} onBlur={saveField('styleGuide')} rows={3} placeholder="鏡頭語言、色調、SDXL 風格關鍵字（如 photorealistic, cinematic lighting）、敘事調性…" textareaClassName="resize-none" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="語氣／調性" value={form.tone} onChange={set('tone')} onBlur={saveField('tone')} placeholder="如：迷因吐槽、溫馨" />
          <Input label="類型" value={form.genre} onChange={set('genre')} onBlur={saveField('genre')} placeholder="如：喜劇、恐怖" />
          <Input label="目標觀眾" value={form.targetAudience} onChange={set('targetAudience')} onBlur={saveField('targetAudience')} placeholder="如：年輕族群" />
        </div>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">補充（禁忌、catchphrase、品牌調性…）</span>
            {aiEnabled && wandBtn('bibleNotes')}
          </div>
          <Textarea value={form.bibleNotes} onChange={set('bibleNotes')} onBlur={saveField('bibleNotes')} rows={2} placeholder="任何想讓 AI 記住的補充設定…" textareaClassName="resize-none" />
        </div>
      </section>

      {/* 字幕樣式 */}
      <section className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">字幕樣式（成片旁白字幕外觀）</h2>
        <p className="mb-3 text-xs text-gray-400">套用於生成影片時燒進畫面的旁白字幕；喜劇大字幕／反轉字幕另有專屬樣式不受影響。改後需重新「② 生成影片」套用。</p>
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span className="flex-none">快速套用</span>
          {([
            ['迷因大黃', { fontSize: 64, color: '#FFE000', position: 'bottom' }],
            ['經典白字', { fontSize: 42, color: '#FFFFFF', position: 'bottom' }],
            ['置中大字', { fontSize: 56, color: '#FFFFFF', position: 'center' }],
          ] as const).map(([label, preset]) => {
            const active = sub.fontSize === preset.fontSize && sub.color.toUpperCase() === preset.color && sub.position === preset.position;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => saveSub({ ...preset, segment: sub.segment, plate: sub.plate, highlight: sub.highlight, highlightColor: sub.highlightColor })}
                className={`rounded border px-2 py-0.5 ${active ? 'border-blue-400 bg-blue-50 font-medium text-blue-700 ring-1 ring-blue-300 dark:bg-blue-950/30 dark:text-blue-300' : 'border-gray-300 text-gray-600 hover:bg-white dark:border-gray-300 dark:hover:bg-gray-200'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">字級（px）</label>
            <input type="number" min={20} max={120} step={2} aria-label="字幕字級" value={sub.fontSize} onChange={(e) => saveSub({ ...sub, fontSize: Number(e.target.value) || 42 })} className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">顏色</label>
            <input type="color" aria-label="字幕顏色" value={sub.color} onChange={(e) => saveSub({ ...sub, color: e.target.value })} className="h-9 w-full rounded-md border border-gray-300 bg-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">位置</label>
            <select aria-label="字幕位置" value={sub.position} onChange={(e) => saveSub({ ...sub, position: e.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50">
              <option value="bottom">底部</option>
              <option value="center">置中</option>
              <option value="top">頂部</option>
            </select>
          </div>
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-200 dark:bg-gray-50">
          <input type="checkbox" checked={sub.segment} onChange={(e) => saveSub({ ...sub, segment: e.target.checked })} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
          <span className="text-xs leading-relaxed text-gray-600">
            <span className="font-medium text-gray-700">動態逐句字幕（Pop-on）</span>
            ：把整段旁白切成短句，跟著語音逐句彈出（而非整段停在畫面）。短影音保留率最高的字幕形式，建議開啟。
          </span>
        </label>
        {/* 卡拉OK逐字高亮：需先開 Pop-on 才生效，故縮排為子選項 */}
        <div className={`mt-2 ml-6 rounded-md border p-2.5 transition-opacity ${sub.segment ? 'border-gray-200 bg-white dark:border-gray-200 dark:bg-gray-50' : 'border-dashed border-gray-200 bg-gray-50 opacity-60 dark:bg-gray-100'}`}>
          <label className={`flex items-start gap-2 ${sub.segment ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
            <input type="checkbox" disabled={!sub.segment} checked={sub.highlight} onChange={(e) => saveSub({ ...sub, highlight: e.target.checked })} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
            <span className="text-xs leading-relaxed text-gray-600">
              <span className="font-medium text-gray-700">卡拉OK逐字高亮</span>
              ：字幕跟著語音「逐字變色」（如 Reels／Submagic 那種效果），把注意力鎖在正在講的字上。{!sub.segment && <span className="text-gray-400">（需先開啟「動態逐句字幕」）</span>}
            </span>
          </label>
          {sub.highlight && sub.segment && (
            <div className="mt-2 flex items-center gap-2 pl-6">
              <span className="text-xs text-gray-500">高亮色</span>
              <input type="color" aria-label="卡拉OK高亮色" value={sub.highlightColor} onChange={(e) => saveSub({ ...sub, highlightColor: e.target.value })} className="h-7 w-12 rounded border border-gray-300 bg-white" />
              {(['#FFD400', '#22FF88', '#FF4D6D', '#4DA6FF'] as const).map((c) => (
                <button key={c} type="button" aria-label={`高亮色 ${c}`} onClick={() => saveSub({ ...sub, highlightColor: c })} style={{ backgroundColor: c }} className={`h-5 w-5 rounded-full border ${sub.highlightColor.toUpperCase() === c ? 'border-gray-700 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300'}`} />
              ))}
            </div>
          )}
        </div>
        <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-200 dark:bg-gray-50">
          <input type="checkbox" checked={sub.plate} onChange={(e) => saveSub({ ...sub, plate: e.target.checked })} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
          <span className="text-xs leading-relaxed text-gray-600">
            <span className="font-medium text-gray-700">字幕底板</span>
            ：字幕後加半透明黑底，雜亂或高亮背景（戶外、白牆、天空）上更好讀。乾淨背景可關閉。
          </span>
        </label>
        <div className="mt-3">
          <div className="mb-1 text-xs text-gray-400">預覽{sub.segment ? (sub.highlight ? '（逐句彈出＋逐字高亮示意）' : '（實際會逐句彈出）') : ''}</div>
          <div className={`flex h-28 overflow-hidden rounded bg-gray-800 px-3 ${sub.position === 'top' ? 'items-start pt-2' : sub.position === 'center' ? 'items-center' : 'items-end pb-2'} justify-center`}>
            <span key={sub.segment ? previewIdx : 'static'} style={{ fontSize: Math.max(10, Math.min(30, sub.fontSize * 0.35)), color: sub.color, textShadow: '0 0 2px #000,0 0 2px #000,0 0 2px #000', backgroundColor: sub.plate ? 'rgba(0,0,0,0.5)' : undefined, padding: sub.plate ? '2px 8px' : undefined, borderRadius: sub.plate ? 4 : undefined }} className="animate-in fade-in zoom-in-95 duration-200 text-center font-medium leading-tight">
              {!sub.segment ? '這是旁白字幕預覽' : sub.highlight ? (() => {
                // 逐字高亮示意：句子前段用高亮色（已朗讀），後段維持基本色（尚未讀到）
                const chars = Array.from(POP_SAMPLE[previewIdx]);
                const k = Math.max(1, Math.ceil(chars.length * 0.6));
                return (<>{<span style={{ color: sub.highlightColor }}>{chars.slice(0, k).join('')}</span>}{chars.slice(k).join('')}</>);
              })() : POP_SAMPLE[previewIdx]}
            </span>
          </div>
        </div>
      </section>

      {/* Stock B-roll（Pexels 圖庫配圖）*/}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">實拍素材 B-roll（Pexels 圖庫）</h2>
        <p className="mb-3 text-xs text-gray-400">開啟後「① 生成圖片」改為依每鏡關鍵字自動從 Pexels 免費圖庫配真實照片（取代 AI 生圖），適合新聞/知識/實拍感解說片。配不到圖的鏡自動退回 AI 生圖。{!stock.available && <span className="text-amber-600">（伺服器未設定 PEXELS_API_KEY，暫不可用）</span>}</p>
        <label className={`flex items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-200 dark:bg-gray-50 ${stock.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
          <input type="checkbox" disabled={!stock.available} checked={stock.on} onChange={(e) => saveStock(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
          <span className="text-xs leading-relaxed text-gray-600"><span className="font-medium text-gray-700">用圖庫照片當關鍵幀</span>（免費、可商用；含角色 faceid 的鏡不受影響）</span>
        </label>
      </section>

      {/* 調色 look（濾鏡）*/}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">調色 look（整片濾鏡風格）</h2>
        <p className="mb-3 text-xs text-gray-400">整片統一的電影感調色；「跟隨風格」＝用所選影片風格的預設調色。下方為近似預覽（實際以引擎為準）。改後需重新「② 生成影片」套用。</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {LOOKS.map((L) => {
            const active = look === L.key;
            return (
              <button key={L.key || 'none'} type="button" onClick={() => saveLook(L.key)}
                className={`group flex flex-col items-center gap-1 rounded-md border p-1.5 transition ${active ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300 dark:border-gray-200'}`}>
                <span aria-hidden className="h-10 w-full rounded" style={{ filter: L.css, background: 'linear-gradient(120deg,#e8b98a 0%,#4a90d9 35%,#3fb56b 60%,#e64c6d 100%)' }} />
                <span className={`text-[11px] leading-tight ${active ? 'font-semibold text-blue-700' : 'text-gray-600'}`}>{L.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 品牌浮水印 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">品牌浮水印（頻道 handle）</h2>
        <p className="mb-3 text-xs text-gray-400">在成片角落常駐一行半透明的頻道 handle（如 @yourname），強化品牌識別、被轉發也帶得走。留空＝不加。改後需重新「② 生成影片」套用。</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500" htmlFor="wm-text">Handle 文字</label>
            <input id="wm-text" type="text" maxLength={40} placeholder="@yourchannel（留空＝關閉）" value={wm.text} onChange={(e) => saveWm({ ...wm, text: e.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500" htmlFor="wm-pos">位置</label>
            <select id="wm-pos" aria-label="浮水印位置" value={wm.position} onChange={(e) => saveWm({ ...wm, position: e.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50">
              <option value="tr">右上</option>
              <option value="tl">左上</option>
              <option value="br">右下</option>
              <option value="bl">左下</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 text-xs text-gray-400">預覽{wm.text.trim() ? '' : '（未設定）'}</div>
          <div className="relative h-28 overflow-hidden rounded bg-gray-800">
            {wm.text.trim() && (
              <span
                style={{ opacity: 0.6, textShadow: '0 1px 1px #000' }}
                className={`absolute text-xs font-medium text-white ${wm.position === 'tl' ? 'left-2 top-2' : wm.position === 'tr' ? 'right-2 top-2' : wm.position === 'bl' ? 'bottom-2 left-2' : 'bottom-2 right-2'}`}
              >
                {wm.text.trim()}
              </span>
            )}
          </div>
        </div>

        {/* 品牌 logo（圖片浮水印）*/}
        <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-200">
          <div className="mb-1 text-xs font-medium text-gray-700">品牌 logo（圖片浮水印）</div>
          <p className="mb-2 text-xs text-gray-400">上傳透明背景 PNG 最佳（≤250KB）；燒在成片角落，與文字 handle 可並存。</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:bg-gray-50">
              {logo.hasLogo ? '更換 logo' : '上傳 logo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0])} />
            </label>
            {logo.hasLogo && (
              <>
                <select aria-label="logo 位置" value={logo.position} onChange={(e) => saveLogoOpts({ position: e.target.value, scale: logo.scale })} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 dark:bg-gray-50">
                  <option value="tl">左上</option>
                  <option value="tr">右上</option>
                  <option value="bl">左下</option>
                  <option value="br">右下</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-gray-500">大小
                  <input type="range" min={5} max={40} value={Math.round(logo.scale * 100)} onChange={(e) => saveLogoOpts({ position: logo.position, scale: Number(e.target.value) / 100 })} className="accent-blue-600" />
                </label>
                <button type="button" onClick={removeLogo} className="text-xs text-red-600 hover:underline">移除</button>
              </>
            )}
          </div>
          {logo.hasLogo && (
            <div className={`relative mt-2 h-24 overflow-hidden rounded bg-gray-800`}>
              {logoPreview
                ? <img src={logoPreview} alt="logo 預覽" style={{ width: `${logo.scale * 100}%` }} className={`absolute max-h-full object-contain ${logo.position === 'tl' ? 'left-2 top-2' : logo.position === 'tr' ? 'right-2 top-2' : logo.position === 'bl' ? 'bottom-2 left-2' : 'bottom-2 right-2'}`} />
                : <span className="absolute left-2 top-2 text-xs text-gray-400">已設定 logo（上傳新檔可更換）</span>}
            </div>
          )}
        </div>
      </section>

      {/* 進度條 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">進度條（觀看進度）</h2>
        <p className="mb-3 text-xs text-gray-400">成片底部（或頂部）一條隨播放增長的細條，讓觀眾看到「還剩多少」，短影音有助完播率。改後需重新「② 生成影片」套用。</p>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-200 dark:bg-gray-50">
          <input type="checkbox" checked={pb.enabled} onChange={(e) => savePb({ ...pb, enabled: e.target.checked })} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
          <span className="text-xs leading-relaxed text-gray-600"><span className="font-medium text-gray-700">顯示進度條</span></span>
        </label>
        {pb.enabled && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">顏色</span>
              <input type="color" aria-label="進度條顏色" value={pb.color} onChange={(e) => savePb({ ...pb, color: e.target.value })} className="h-7 w-12 rounded border border-gray-300 bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">位置</span>
              <select aria-label="進度條位置" value={pb.position} onChange={(e) => savePb({ ...pb, position: e.target.value })} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 dark:bg-gray-50">
                <option value="bottom">底部</option>
                <option value="top">頂部</option>
              </select>
            </div>
            <div className={`relative h-8 flex-1 overflow-hidden rounded bg-gray-800 ${pb.position === 'top' ? 'flex items-start' : 'flex items-end'}`}>
              <span className="h-1.5 w-3/5 rounded-sm" style={{ backgroundColor: pb.color }} />
            </div>
          </div>
        )}
      </section>

      {/* 電影感收尾 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">電影感收尾（膠片質感）</h2>
        <p className="mb-3 text-xs text-gray-400">在成片最後疊一層細膠片噪點＋暗角，把乾淨數位感變成「拍出來的」電影質感。改後需重新「② 生成影片」套用。</p>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-200 dark:bg-gray-50">
          <input type="checkbox" checked={film.enabled} onChange={(e) => saveFilm({ ...film, enabled: e.target.checked })} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
          <span className="text-xs leading-relaxed text-gray-600"><span className="font-medium text-gray-700">開啟電影感收尾</span></span>
        </label>
        {film.enabled && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">強度</span>
            <select aria-label="電影感強度" value={film.intensity} onChange={(e) => saveFilm({ ...film, intensity: e.target.value })} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 dark:bg-gray-50">
              <option value="subtle">低調</option>
              <option value="strong">明顯（復古）</option>
            </select>
          </div>
        )}
      </section>

      {/* 章節標題 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">章節標題（段落 lower-third）</h2>
        <p className="mb-3 text-xs text-gray-400">每個場景的第一個鏡頭，在畫面下三分之一疊出該場景的標題（品牌強調色細條＋深色底板），幫觀眾抓住段落結構。需要場景有填標題。改後需重新「② 生成影片」套用。</p>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-200 dark:bg-gray-50">
          <input type="checkbox" checked={sceneTitles} onChange={(e) => saveSceneTitles(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
          <span className="text-xs leading-relaxed text-gray-600"><span className="font-medium text-gray-700">顯示章節標題</span>：每個場景開頭疊出段落標題（強調色沿用影片風格）。</span>
        </label>
      </section>

      {/* 配樂情緒 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">配樂情緒（背景音樂）</h2>
        <p className="mb-3 text-xs text-gray-400">程序化背景音樂的氛圍。「自動」＝依題材/分鏡情緒推導；也可直接指定一種。（自行上傳 BGM 時以上傳為準。）改後需重新「② 生成影片」套用。</p>
        <select aria-label="配樂情緒" value={bgmMood} onChange={(e) => saveBgmMood(e.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50 sm:w-72">
          {BGM_MOODS.map((m) => <option key={m.key || 'auto'} value={m.key}>{m.label}</option>)}
        </select>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-200 dark:bg-gray-50">
          <input type="checkbox" checked={autoSfx} onChange={(e) => saveAutoSfx(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-blue-600" />
          <span className="text-xs leading-relaxed text-gray-600"><span className="font-medium text-gray-700">自動轉場音效</span>：每次換場景自動加一聲輕 whoosh，讓節奏更有律動（與逐鏡自訂音效並存）。</span>
        </label>
      </section>

      {/* 字幕 / 章節下載 */}
      {(hasSubs || hasChapters) && (
        <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">字幕 / 章節（CC・二次利用）</h2>
          <p className="mb-3 text-xs text-gray-400">已隨成片產生對齊時間軸的字幕與 YouTube 章節，可上傳當 CC、做無障礙、二次剪輯，或把章節貼進影片說明成為可點目錄。（每次「② 生成影片」會更新。）</p>
          <div className="flex flex-wrap gap-2">
            {hasSubs && <a href={`/api/v1/studio/projects/${projectId}/subtitles?format=srt`} download className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:bg-gray-50">⬇ 下載 SRT</a>}
            {hasSubs && <a href={`/api/v1/studio/projects/${projectId}/subtitles?format=vtt`} download className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:bg-gray-50">⬇ 下載 VTT</a>}
            {hasChapters && <a href={`/api/v1/studio/projects/${projectId}/subtitles?format=chapters`} download className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:bg-gray-50">⬇ 下載 YouTube 章節</a>}
          </div>
        </section>
      )}

      {/* 專案角色 */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-200 dark:bg-gray-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700"><PiUsersThreeDuotone className="h-4 w-4" /> 專案角色</h2>
          <Link href="/studio/characters" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700" title="到角色庫建立 / 編輯角色（可跨專案重用）">
            管理角色庫 <PiArrowSquareOutBold className="h-3 w-3" />
          </Link>
        </div>

        {attached.length === 0 ? (
          <p className="mb-3 text-xs text-gray-400">尚未指定角色。加入角色後，AI 生成會帶入其個性／外觀／語音，並可指派到分鏡（驅動 FaceID 一致臉與配音）。</p>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {attached.map((pc) => (
              <div key={pc.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-200 dark:bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/v1/studio/characters/${pc.characterId}/avatar`}
                  alt={pc.character.name}
                  className="h-9 w-9 flex-none rounded-full bg-gray-100 object-cover"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-700">{pc.character.name}</div>
                  {pc.roleInStory && <div className="truncate text-xs text-gray-400">{pc.roleInStory}</div>}
                </div>
                <button type="button" onClick={() => void detachChar(pc.characterId)} aria-label="移出專案" title="移出專案（不刪角色庫）" className="flex-none rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
                  <PiTrashBold className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <select
            aria-label="從角色庫加入角色"
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50"
          >
            <option value="">＋ 從角色庫加入角色…</option>
            {attachable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            value={pickRole}
            onChange={(e) => setPickRole(e.target.value)}
            placeholder="定位（選填，如 主角／反派）"
            title="此角色在本故事的定位；會帶入 AI 生成脈絡，提升一致性"
            maxLength={120}
            className="w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-50"
          />
          <button
            type="button"
            onClick={() => void attachChar(pickId)}
            disabled={!pickId}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <PiPlusBold className="h-4 w-4" /> 加入
          </button>
        </div>
        {attachable.length === 0 && library.length === 0 && (
          <p className="mt-2 text-xs text-gray-400">角色庫還是空的 — <Link href="/studio/characters" className="text-blue-600 hover:underline">先到角色庫建立角色</Link>。</p>
        )}
      </section>

      <div className="mb-8 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/20">
        <span className="text-sm text-emerald-800 dark:text-emerald-300">設定好了？接著寫腳本，或開右下角「AI 助手」讓 AI 依此提案。</span>
        <Link href={`/studio/${projectId}/script`} className="flex flex-none items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          下一步：腳本 <PiArrowRightBold className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
