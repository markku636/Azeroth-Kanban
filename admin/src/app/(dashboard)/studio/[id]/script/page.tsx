'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge, Button, Input, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiSparkleFill, PiPlusBold, PiCaretLeftBold, PiFilmReelBold, PiTrashBold,
  PiDotsSixVerticalBold, PiFilmSlateDuotone, PiArrowRightBold, PiCopyBold,
} from 'react-icons/pi';
import { usePrompt } from '@/hooks/use-prompt';
import { useConfirm } from '@/hooks/use-confirm';

interface ShotLite { id: string; shotNo: number }
interface SceneDto { id: string; title: string; synopsis: string | null; dialogue: string | null; sortOrder: number; shots: ShotLite[] }
interface ProjectDto { id: string; title: string; status: string; description: string | null; logline: string | null }
interface Storyboard { project: ProjectDto; scenes: SceneDto[] }

function Spinner({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

/** 單張「故事場景」卡：標題／劇情概要／台詞可就地編輯（blur 時存檔），可拖曳排序、展開分鏡、刪除。 */
function SceneCard({
  scene, index, disabled, aiEnabled, onSave, onExpand, onDelete,
}: {
  scene: SceneDto; index: number; disabled: boolean; aiEnabled: boolean;
  onSave: (patch: { title?: string; synopsis?: string; dialogue?: string }) => Promise<void>;
  onExpand: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [title, setTitle] = useState(scene.title);
  const [synopsis, setSynopsis] = useState(scene.synopsis ?? '');
  const [dialogue, setDialogue] = useState(scene.dialogue ?? '');
  const [saving, setSaving] = useState(false);
  const [wandBusy, setWandBusy] = useState(false);

  // 場景欄位 AI 潤飾（synopsis 是展開分鏡的種子、dialogue 為台詞草稿）：潤飾後直接套用並存檔。
  const polishField = async (field: 'synopsis' | 'dialogue') => {
    setWandBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/scenes/${scene.id}/polish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, text: field === 'synopsis' ? synopsis : dialogue }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'AI 潤飾失敗');
      const out = j.data?.text as string | undefined;
      if (!out) throw new Error('AI 沒有產生內容');
      if (field === 'synopsis') setSynopsis(out); else setDialogue(out);
      await onSave({ [field]: out });
      toast.success('已用 AI 潤飾並儲存');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'AI 潤飾失敗'); }
    setWandBusy(false);
  };

  // props 變動（例如 reload 後）時同步本地值
  useEffect(() => { setTitle(scene.title); setSynopsis(scene.synopsis ?? ''); setDialogue(scene.dialogue ?? ''); }, [scene.id, scene.title, scene.synopsis, scene.dialogue]);

  const save = async (patch: { title?: string; synopsis?: string; dialogue?: string }) => {
    setSaving(true);
    try { await onSave(patch); } finally { setSaving(false); }
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-200 dark:bg-gray-50">
      <div className="mb-2 flex items-center gap-2">
        <span {...attributes} {...listeners} className="cursor-grab select-none text-gray-300 hover:text-gray-500" aria-label="拖曳排序">
          <PiDotsSixVerticalBold className="h-4 w-4" />
        </span>
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">{index + 1}</span>
        <Input
          variant="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() && title !== scene.title) void save({ title }); else if (!title.trim()) setTitle(scene.title); }}
          placeholder="場景標題"
          className="flex-1"
          inputClassName="font-semibold"
        />
        <Badge color="secondary" variant="flat" size="sm" className="whitespace-nowrap">{scene.shots.length} 分鏡</Badge>
        {saving && <Spinner className="h-3 w-3 text-blue-500" />}
      </div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">劇情概要</span>
        {aiEnabled && (
          <button
            type="button"
            onClick={() => void polishField('synopsis')}
            disabled={wandBusy || disabled}
            title="用 AI 潤飾劇情概要（依故事脈絡改寫並儲存，能拉高展開分鏡的品質）"
            className="flex items-center gap-1 rounded-md border border-purple-300 px-2 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:border-purple-400 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/20"
          >
            <PiSparkleFill className="h-3 w-3" /> {wandBusy ? '潤飾中…' : '潤飾'}
          </button>
        )}
      </div>
      <Textarea
        value={synopsis}
        onChange={(e) => setSynopsis(e.target.value)}
        onBlur={() => { if (synopsis !== (scene.synopsis ?? '')) void save({ synopsis }); }}
        rows={3}
        placeholder="這一場在演什麼？（人物、動作、轉折）"
        textareaClassName="resize-none"
      />
      <div className="mt-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-700">台詞／旁白草稿（選填）</span>
          {aiEnabled && dialogue.trim() && (
            <button
              type="button"
              onClick={() => void polishField('dialogue')}
              disabled={wandBusy || disabled}
              title="用 AI 潤飾台詞（更口語、有態度，依角色與本場情境）"
              className="flex items-center gap-1 rounded-md border border-purple-300 px-2 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:border-purple-400 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/20"
            >
              <PiSparkleFill className="h-3 w-3" /> {wandBusy ? '潤飾中…' : '潤飾'}
            </button>
          )}
        </div>
        <Textarea
          value={dialogue}
          onChange={(e) => setDialogue(e.target.value)}
          onBlur={() => { if (dialogue !== (scene.dialogue ?? '')) void save({ dialogue }); }}
          rows={2}
          placeholder="關鍵台詞或旁白…"
          textareaClassName="resize-none"
        />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onExpand}
          disabled={disabled}
          title="用 AI 把這一場的劇情概要展開成分鏡"
          className="flex items-center gap-1 rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-700 dark:text-emerald-300"
        >
          <PiFilmReelBold className="h-3.5 w-3.5" /> 展開為分鏡
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          title="刪除場景（其分鏡會落到未分場，不會被刪除）"
          className="ms-auto flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          <PiTrashBold className="h-3.5 w-3.5" /> 刪除
        </button>
      </div>
    </div>
  );
}

export default function ScriptPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const prompt = usePrompt();
  const confirm = useConfirm();

  const [data, setData] = useState<Storyboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [logline, setLogline] = useState('');
  const [premise, setPremise] = useState('');
  const [loglineWandBusy, setLoglineWandBusy] = useState(false);
  const savedRef = useRef({ logline: '', premise: '' });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/storyboard`);
      const json = await res.json();
      if (res.ok) {
        setData(json.data);
        const p = json.data?.project;
        setLogline(p?.logline ?? '');
        setPremise(p?.description ?? '');
        savedRef.current = { logline: p?.logline ?? '', premise: p?.description ?? '' };
      } else setError(json.message ?? '載入失敗');
    } catch { setError('載入失敗'); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/studio/config');
        const json = await res.json();
        if (res.ok && json.data) setAiEnabled(Boolean(json.data.aiEnabled));
      } catch { /* 預設視為可用 */ }
    })();
  }, []);

  const patchProject = async (patch: Record<string, string>) => {
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '儲存失敗'); }
    } catch (e) { toast.error(e instanceof Error ? e.message : '儲存失敗'); }
  };

  const saveLogline = () => { if (logline !== savedRef.current.logline) { savedRef.current.logline = logline; void patchProject({ logline }); } };

  // logline AI 潤飾（複用 bible/polish 的 logline 欄位）：改寫成像會爆的影片標題，套用並存。
  const polishLogline = async () => {
    setLoglineWandBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/bible/polish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field: 'logline', text: logline }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'AI 潤飾失敗');
      const out = j.data?.text as string | undefined;
      if (!out) throw new Error('AI 沒有產生內容');
      setLogline(out); savedRef.current.logline = out; void patchProject({ logline: out });
      toast.success('已用 AI 潤飾 logline');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'AI 潤飾失敗'); }
    setLoglineWandBusy(false);
  };
  const savePremise = () => { if (premise !== savedRef.current.premise) { savedRef.current.premise = premise; void patchProject({ description: premise }); } };

  const saveScene = async (sceneId: string, patch: { title?: string; synopsis?: string; dialogue?: string }) => {
    try {
      const res = await fetch(`/api/v1/studio/scenes/${sceneId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '儲存失敗'); }
      // 樂觀更新本地（避免整頁重抓造成輸入框失焦閃動）
      setData((d) => d ? { ...d, scenes: d.scenes.map((s) => s.id === sceneId ? { ...s, ...patch } : s) } : d);
    } catch (e) { toast.error(e instanceof Error ? e.message : '儲存失敗'); throw e; }
  };

  const genScript = async () => {
    if (!aiEnabled) { toast('AI 尚未啟用：請設定 AI 憑證，或用「+ 新增場景」手動建立腳本', { icon: '🔒' }); return; }
    // 生成是「新增」場景而非取代 — 已有場景時再生成會疊加重複，先確認（同 expand/R13/R56 footgun）。
    const existingScenes = (data?.scenes ?? []).filter((s) => s.id !== '__unassigned__').length;
    if (existingScenes > 0) {
      const ok = await confirm({ title: '已有場景', message: `目前已有 ${existingScenes} 個場景。AI 生成會「再新增」場景（不會取代既有），可能造成重複。要繼續嗎？`, confirmLabel: '繼續生成' });
      if (!ok) return;
    }
    let body: Record<string, unknown> = {};
    if (!premise.trim()) {
      const p = await prompt({ title: 'AI 生成腳本', message: '先給一句故事題材，我幫你生出 logline 與分場', placeholder: '例：長大的小智揹著房貸回到舊街…', confirmLabel: '生成', required: true });
      if (!p) return;
      body = { premise: p };
    }
    const cnt = await prompt({ title: '幾個場景？', placeholder: '4', defaultValue: '4', confirmLabel: '生成' });
    const n = parseInt(cnt ?? '4', 10);
    if (n > 0) body.sceneCount = n;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? '生成失敗');
      toast.success(`已生成 ${j.data?.sceneCount ?? ''} 個場景`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '生成失敗'); }
    setBusy(false);
  };

  const addScene = async () => {
    const title = await prompt({ title: '新增場景', placeholder: '場景名稱', defaultValue: `場景 ${(data?.scenes.filter((s) => s.id !== '__unassigned__').length ?? 0) + 1}`, confirmLabel: '新增', required: true });
    if (!title) return;
    if (title.length > 120) { toast.error('場景標題不可超過 120 字'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/scenes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '新增失敗'); }
      toast.success('場景已新增'); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '新增失敗'); }
    setBusy(false);
  };

  const expandScene = async (scene: SceneDto) => {
    if (!aiEnabled) { toast('AI 尚未啟用：可到分鏡看板用「+ 新增分鏡」手動建立', { icon: '🔒' }); return; }
    // 展開是「新增」而非取代 — 對已有分鏡的場景再展開會疊加重複分鏡，先確認。
    if (scene.shots.length > 0) {
      const ok = await confirm({ title: '這一場已有分鏡', message: `「${scene.title}」已有 ${scene.shots.length} 個分鏡。展開會「再新增」分鏡（不會取代既有），可能造成重複。要繼續嗎？`, confirmLabel: '繼續展開' });
      if (!ok) return;
    }
    setBusy(true);
    const t = toast.loading(`展開「${scene.title}」為分鏡…`);
    try {
      const res = await fetch(`/api/v1/studio/scenes/${scene.id}/expand`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? '展開失敗');
      toast.success(`已展開 ${j.data?.shotCount ?? ''} 個分鏡`, { id: t });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '展開失敗', { id: t }); }
    setBusy(false);
  };

  const expandAll = async () => {
    const ready = (data?.scenes ?? []).filter((s) => s.id !== '__unassigned__' && (s.synopsis?.trim() || s.dialogue?.trim()));
    if (!ready.length) { toast('沒有可展開的場景（請先填寫劇情概要）'); return; }
    if (!aiEnabled) { toast('AI 尚未啟用：可到分鏡看板用「+ 新增分鏡」手動建立', { icon: '🔒' }); return; }
    // 展開是「新增」分鏡 — 只展開尚未有分鏡的場景，避免一鍵把已展開的場景全部疊成重複分鏡。
    const pending = ready.filter((s) => s.shots.length === 0);
    if (!pending.length) { toast('所有場景都已展開過了', { icon: '✅' }); router.push(`/studio/${projectId}`); return; }
    const skipped = ready.length - pending.length;
    setBusy(true);
    const t = toast.loading(skipped > 0 ? `展開 ${pending.length} 個場景（略過 ${skipped} 個已展開）…` : '全部展開為分鏡…');
    try {
      for (const sc of pending) {
        await fetch(`/api/v1/studio/scenes/${sc.id}/expand`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      }
      toast.success('已展開，前往分鏡看板', { id: t });
      router.push(`/studio/${projectId}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : '展開失敗', { id: t }); setBusy(false); }
  };

  const deleteScene = async (scene: SceneDto) => {
    const ok = await confirm({ title: '刪除場景', message: `確定刪除「${scene.title}」？其下的分鏡會落到「未分場」，不會被刪除。`, type: 'danger', confirmLabel: '刪除' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/scenes/${scene.id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '刪除失敗'); }
      toast.success('場景已刪除'); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : '刪除失敗'); }
    setBusy(false);
  };

  // 複製整份腳本（片名＋logline＋題材＋各場 synopsis/台詞）為 markdown，供審稿／分享外用。
  const copyScript = () => {
    const scs = (data?.scenes ?? []).filter((s) => s.id !== '__unassigned__');
    if (!logline.trim() && !premise.trim() && scs.length === 0) { toast('沒有腳本可複製'); return; }
    const parts: string[] = [];
    if (data?.project.title) parts.push(`# ${data.project.title}`);
    if (logline.trim()) parts.push(`**Logline：** ${logline.trim()}`);
    if (premise.trim()) parts.push(`**題材：** ${premise.trim()}`);
    scs.forEach((s, i) => {
      parts.push(`\n## ${i + 1}. ${s.title}`);
      if (s.synopsis?.trim()) parts.push(s.synopsis.trim());
      if (s.dialogue?.trim()) parts.push(`台詞：${s.dialogue.trim()}`);
    });
    navigator.clipboard.writeText(parts.join('\n')).then(() => toast.success('已複製腳本'), () => toast.error('複製失敗'));
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;
    // 與分鏡看板同慣例：afterId = 拖放目標卡 → 插在該卡之前（service computeSceneSortOrder）。
    try {
      const res = await fetch(`/api/v1/studio/scenes/${String(active.id)}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ afterId: String(over.id) }),
      });
      if (!res.ok) throw new Error();
    } catch { toast.error('排序失敗'); }
    await load();
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" /></div>;
  }
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  const scenes = data.scenes.filter((s) => s.id !== '__unassigned__');
  const unassignedCount = data.scenes.find((s) => s.id === '__unassigned__')?.shots.length ?? 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-2 py-2 sm:p-6">
      <div className="mb-3">
        <Link href={`/studio/${projectId}`} className="mb-1 inline-flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-blue-600">
          <PiCaretLeftBold className="h-3 w-3" /> 分鏡看板
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">✍ 腳本 · {data.project.title}</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={copyScript} disabled={busy} title="複製整份腳本（片名／logline／各場大綱）">
              <PiCopyBold className="me-1.5 h-4 w-4" /> 複製腳本
            </Button>
            <Button variant="outline" onClick={() => void genScript()} disabled={busy} title={aiEnabled ? '用 AI 從題材生成 logline 與分場' : '需設定 AI 憑證'}>
              <PiSparkleFill className="me-1.5 h-4 w-4 text-purple-500" /> AI 生成腳本
            </Button>
            <Button onClick={() => void expandAll()} disabled={busy || scenes.length === 0} className="bg-emerald-600 text-white hover:bg-emerald-700">
              <PiArrowRightBold className="me-1.5 h-4 w-4" /> 全部展開為分鏡
            </Button>
          </div>
        </div>
      </div>

      {!aiEnabled && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          🔒 AI 尚未啟用（後端未設定 AI 憑證）。你仍可手動撰寫腳本：填「題材／前提」、「+ 新增場景」並逐場寫劇情概要，再到分鏡看板手動建立分鏡。
        </div>
      )}

      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-200 dark:bg-gray-100">
        <Input
          label="題材／設定"
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          onBlur={savePremise}
          placeholder="這支短片的題材、世界觀或設定…"
        />
        <div className="mt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">Logline（一句話前提）</span>
            {aiEnabled && (
              <button
                type="button"
                onClick={() => void polishLogline()}
                disabled={loglineWandBusy || busy}
                title="用 AI 把 logline 改寫成像會爆的影片標題（套用並儲存）"
                className="flex items-center gap-1 rounded-md border border-purple-300 px-2 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:border-purple-400 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/20"
              >
                <PiSparkleFill className="h-3 w-3" /> {loglineWandBusy ? '潤飾中…' : '潤飾'}
              </button>
            )}
          </div>
          <Input
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            onBlur={saveLogline}
            placeholder="一句話講完整個故事的核心…"
          />
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">故事場景（{scenes.length}）</h2>
        {unassignedCount > 0 && <span className="text-xs text-gray-400">另有 {unassignedCount} 個未分場分鏡</span>}
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-200 py-12 text-center text-gray-400">
          <PiFilmSlateDuotone className="h-12 w-12 text-gray-300" />
          <div className="text-sm">尚無場景。用「✨ AI 生成腳本」一句話生出分場，或「+ 新增場景」手動開始。</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void genScript()}><PiSparkleFill className="me-1.5 h-4 w-4 text-purple-500" /> AI 生成腳本</Button>
            <Button size="sm" onClick={() => void addScene()} className="bg-blue-600 text-white hover:bg-blue-700"><PiPlusBold className="me-1.5 h-4 w-4" /> 新增場景</Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {scenes.map((sc, i) => (
                  <SceneCard
                    key={sc.id}
                    scene={sc}
                    index={i}
                    disabled={busy}
                    aiEnabled={aiEnabled}
                    onSave={(patch) => saveScene(sc.id, patch)}
                    onExpand={() => void expandScene(sc)}
                    onDelete={() => void deleteScene(sc)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button type="button" onClick={() => void addScene()} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 px-2 py-2.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-200">
            <PiPlusBold className="h-4 w-4" /> 新增場景
          </button>
        </div>
      )}
    </div>
  );
}
