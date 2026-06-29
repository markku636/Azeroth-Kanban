'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Input } from 'rizzui';
import toast from 'react-hot-toast';
import { PiPlusBold, PiUserBold, PiMagnifyingGlassBold, PiSpeakerHighBold, PiCaretLeftBold, PiUsersThreeDuotone } from 'react-icons/pi';
import { CharacterEditModal, type CharacterDto } from './_components/character-edit-modal';

export default function CharacterLibraryPage() {
  const [chars, setChars] = useState<CharacterDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<CharacterDto | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/studio/characters${includeArchived ? '?includeArchived=1' : ''}`);
      const j = await res.json();
      if (res.ok && Array.isArray(j.data)) setChars(j.data as CharacterDto[]);
      else toast.error(j.message ?? '載入角色庫失敗');
    } catch { toast.error('載入角色庫失敗'); }
    setLoading(false);
  }, [includeArchived]);

  useEffect(() => { void load(); }, [load]);

  const filtered = chars.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-2 py-4 sm:p-6">
      <Link href="/studio" className="mb-1 inline-flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-blue-600">
        <PiCaretLeftBold className="h-3 w-3" /> 專案列表
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><PiUsersThreeDuotone className="h-6 w-6 text-blue-500" /> 角色庫</h1>
        <Button onClick={() => setCreating(true)} className="bg-blue-600 text-white hover:bg-blue-700"><PiPlusBold className="me-1.5 h-4 w-4" /> 新增角色</Button>
      </div>
      <p className="mb-4 text-sm text-gray-500">在這裡建立可<strong>跨專案重用</strong>的角色：設定個性／外觀、上傳形象圖（FaceID 一致臉）、指定語音。之後到專案的「故事設定」加入角色、再指派到分鏡。</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <PiMagnifyingGlassBold className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋角色…" className="w-full" inputClassName="ps-9" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="rounded" /> 顯示已封存
        </label>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-200 py-16 text-center text-gray-400">
          <PiUserBold className="h-12 w-12 text-gray-300" />
          <div className="text-sm">{q ? '找不到符合的角色' : '角色庫還是空的。點「新增角色」建立第一個可重用角色。'}</div>
          {!q && <Button size="sm" onClick={() => setCreating(true)} className="bg-blue-600 text-white hover:bg-blue-700"><PiPlusBold className="me-1.5 h-4 w-4" /> 新增角色</Button>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setEditing(c)}
              className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-200 dark:bg-gray-50"
            >
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-100">
                {c.faceIdRef || (Array.isArray(c.refImages) && (c.refImages as unknown[]).length > 0) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/v1/studio/characters/${c.id}/avatar`} alt={c.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <PiUserBold className="h-10 w-10 text-gray-300" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-medium text-gray-800 dark:text-gray-700">{c.name}</span>
                  {c.isArchived && <Badge color="secondary" variant="flat" size="sm">已封存</Badge>}
                </div>
                {c.persona && <p className="line-clamp-2 text-xs text-gray-500">{c.persona}</p>}
                {c.sealSpeaker && (
                  <span className="mt-auto inline-flex w-fit items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
                    <PiSpeakerHighBold className="h-3 w-3" /> {c.sealSpeaker}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && <CharacterEditModal onClose={() => setCreating(false)} onSaved={() => void load()} />}
      {editing && <CharacterEditModal character={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </div>
  );
}
