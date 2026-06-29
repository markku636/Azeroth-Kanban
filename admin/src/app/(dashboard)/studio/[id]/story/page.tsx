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
  const [sub, setSub] = useState<{ fontSize: number; color: string; position: string }>({ fontSize: 42, color: '#FFFFFF', position: 'bottom' });
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
        const ss = pJson.data.subtitleStyle as { fontSize?: number; color?: string; position?: string } | null;
        if (ss && typeof ss === 'object') setSub({ fontSize: typeof ss.fontSize === 'number' ? ss.fontSize : 42, color: typeof ss.color === 'string' ? ss.color : '#FFFFFF', position: ss.position === 'top' || ss.position === 'center' ? ss.position : 'bottom' });
      }
      const cJson = await cRes.json().catch(() => ({}));
      if (cRes.ok && Array.isArray(cJson.data)) setLibrary(cJson.data as CharacterLite[]);
    } catch { toast.error('載入故事設定失敗'); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

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

  const saveSub = (next: { fontSize: number; color: string; position: string }) => {
    setSub(next);
    void fetch(`/api/v1/studio/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subtitleStyle: next }) });
  };

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
          ] as const).map(([label, preset]) => (
            <button
              key={label}
              type="button"
              onClick={() => saveSub({ ...preset })}
              className="rounded border border-gray-300 px-2 py-0.5 text-gray-600 hover:bg-white dark:border-gray-300 dark:hover:bg-gray-200"
            >
              {label}
            </button>
          ))}
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
        <div className="mt-3">
          <div className="mb-1 text-xs text-gray-400">預覽</div>
          <div className={`flex h-28 overflow-hidden rounded bg-gray-800 px-3 ${sub.position === 'top' ? 'items-start pt-2' : sub.position === 'center' ? 'items-center' : 'items-end pb-2'} justify-center`}>
            <span style={{ fontSize: Math.max(10, Math.min(30, sub.fontSize * 0.35)), color: sub.color, textShadow: '0 0 2px #000,0 0 2px #000,0 0 2px #000' }} className="text-center font-medium leading-tight">這是旁白字幕預覽</span>
          </div>
        </div>
      </section>

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
