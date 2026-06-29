'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { PiXBold, PiPaperPlaneRightFill, PiCheckBold, PiSparkleFill, PiCheckCircleFill, PiRobotDuotone, PiBroomBold, PiStopFill } from 'react-icons/pi';

type Provider = 'anthropic' | 'vertex' | 'claude-agent';
interface Proposal { kind: string; summary: string; [k: string]: unknown }
interface Msg { role: 'user' | 'assistant'; content: string; proposals?: Proposal[]; applied?: boolean; provider?: string }
const PROVIDER_SHORT: Record<string, string> = { vertex: 'Gemini', anthropic: 'Claude', 'claude-agent': 'Claude Agent' };
interface ProviderAvail { anthropic: boolean; vertex: boolean; claudeAgent: boolean; agentSdk: boolean }

const PROVIDER_HINT: Record<Provider, string> = {
  vertex: 'Gemini（Vertex）單回合：讀整個專案後提案。',
  anthropic: 'Claude（Anthropic）單回合：讀整個專案後提案。',
  'claude-agent': 'Claude Agent：可逐步查詢分鏡/場景/角色細節後再提案（更深入）。',
};
const GREETING = '嗨！我是 AI 導演助手。告訴我你想做什麼——例如「依故事背景補 3 個分鏡」「把第二幕改得更緊湊」「給主角設定語氣」。我會先提案，你審核後再套用。';
const KIND_LABEL: Record<string, string> = {
  set_story_bible: '改故事設定', create_scene: '新增場景', update_scene: '改場景',
  create_shot: '新增分鏡', update_shot: '改分鏡', assign_character_to_shot: '指派角色', attach_character: '加入角色',
};

// 極簡 Markdown 渲染（安全、不用 dangerouslySetInnerHTML）：**粗體**、`行內碼`、- 項目、1. 編號、段落。
function inline(s: string, base: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={`${base}-${i}`}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={`${base}-${i}`} className="rounded bg-black/10 px-1 text-[0.85em]">{p.slice(1, -1)}</code>;
    return <span key={`${base}-${i}`}>{p}</span>;
  });
}
function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];
  const flushB = (k: string) => { if (bullets.length) { blocks.push(<ul key={`ul-${k}`} className="my-1 ml-4 list-disc space-y-0.5">{bullets.map((b, i) => <li key={i}>{inline(b, `li-${k}-${i}`)}</li>)}</ul>); bullets = []; } };
  const flushN = (k: string) => { if (numbered.length) { blocks.push(<ol key={`ol-${k}`} className="my-1 ml-5 list-decimal space-y-0.5">{numbered.map((b, i) => <li key={i}>{inline(b, `oli-${k}-${i}`)}</li>)}</ol>); numbered = []; } };
  text.split('\n').forEach((ln, i) => {
    const mb = ln.match(/^\s*[-*・]\s+(.*)/);
    const mn = ln.match(/^\s*\d+[.、)]\s+(.*)/);
    if (mb) { flushN(String(i)); bullets.push(mb[1]); return; }
    if (mn) { flushB(String(i)); numbered.push(mn[1]); return; }
    flushB(String(i)); flushN(String(i));
    if (ln.trim()) blocks.push(<p key={`p-${i}`} className="my-0.5">{inline(ln, `p-${i}`)}</p>);
  });
  flushB('end'); flushN('end');
  return <div className="space-y-0.5">{blocks}</div>;
}

export function AgentPanel({ projectId, open, onClose, onApplied }: { projectId: string; open: boolean; onClose: () => void; onApplied: () => void }) {
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [avail, setAvail] = useState<ProviderAvail | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 載入供應商可用性 + 專案預設 provider
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [cRes, bRes] = await Promise.all([fetch('/api/v1/studio/config'), fetch(`/api/v1/studio/projects/${projectId}/bible`)]);
        const c = await cRes.json().catch(() => ({}));
        if (cRes.ok && c.data?.providers) setAvail(c.data.providers as ProviderAvail);
        const b = await bRes.json().catch(() => ({}));
        const ap = b?.data?.agentProvider as string | undefined;
        if (ap === 'vertex' || ap === 'anthropic' || ap === 'claude-agent') setProvider(ap);
      } catch { /* 用預設 */ }
    })();
  }, [open, projectId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, sending]);

  const changeProvider = (p: Provider) => {
    setProvider(p);
    void fetch(`/api/v1/studio/projects/${projectId}/bible`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentProvider: p }) });
  };

  const clearChat = () => { if (!sending) setMsgs([{ role: 'assistant', content: GREETING }]); };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const history = msgs.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/agent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, message: text, history }), signal: ctrl.signal,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'AI 回應失敗');
      setMsgs((m) => [...m, { role: 'assistant', content: j.data?.reply || '（沒有文字回覆）', proposals: j.data?.proposals ?? [], provider: j.data?.provider }]);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setMsgs((m) => [...m, { role: 'assistant', content: aborted ? '⏹ 已停止' : `⚠️ ${e instanceof Error ? e.message : 'AI 回應失敗'}` }]);
    }
    abortRef.current = null;
    setSending(false);
  };
  const stop = () => abortRef.current?.abort();

  const apply = async (msgIdx: number, proposals: Proposal[]) => {
    if (!proposals.length) return;
    setSending(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/agent/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposals }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? '套用失敗');
      setMsgs((m) => m.map((x, i) => i === msgIdx ? { ...x, applied: true } : x));
      onApplied();
      window.dispatchEvent(new CustomEvent('studio:reload'));
      const failed = (j.data?.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      if (failed.length) toast(`已套用 ${j.data?.applied} 筆，${failed.length} 筆失敗`, { icon: '⚠️' });
      else toast.success(`已套用 ${j.data?.applied} 筆改動 ✨`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '套用失敗');
    }
    setSending(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-200 dark:bg-gray-50">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-200">
        <div className="flex items-center gap-2">
          <PiRobotDuotone className="h-5 w-5 text-blue-500" />
          <span className="font-semibold text-gray-900">AI 導演助手</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="AI 供應商"
            value={provider}
            onChange={(e) => changeProvider(e.target.value as Provider)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:bg-gray-50"
          >
            <option value="vertex" disabled={avail ? !avail.vertex : false}>Gemini{avail && !avail.vertex ? '（未設定）' : ''}</option>
            <option value="anthropic" disabled={avail ? !avail.anthropic : false}>Claude{avail && !avail.anthropic ? '（未設定）' : ''}</option>
            <option value="claude-agent" disabled={avail ? !avail.claudeAgent : false}>Claude Agent · 多步{avail && !avail.claudeAgent ? '（未設定）' : ''}</option>
          </select>
          <button type="button" onClick={clearChat} disabled={sending} aria-label="清空對話" title="清空對話" className="text-gray-400 hover:text-gray-600 disabled:opacity-40"><PiBroomBold className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 hover:text-gray-600"><PiXBold className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="border-b border-gray-100 px-4 py-1.5 text-xs text-gray-400 dark:border-gray-200">{PROVIDER_HINT[provider]}</div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[88%] ${m.role === 'user' ? '' : 'w-full'}`}>
              <div className={`rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'whitespace-pre-wrap bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 dark:bg-gray-200 dark:text-gray-800'}`}>
                {m.role === 'assistant' ? <MarkdownLite text={m.content} /> : m.content}
              </div>
              {m.role === 'assistant' && m.provider && (
                <div className="mt-0.5 px-1 text-[10px] text-gray-400">{PROVIDER_SHORT[m.provider] ?? m.provider}</div>
              )}
              {m.proposals && m.proposals.length > 0 && (
                <div className="mt-2 space-y-1.5 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-200 dark:bg-gray-50">
                  <div className="flex items-center justify-between px-1">
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-500"><PiSparkleFill className="h-3 w-3 text-purple-500" /> 提案 {m.proposals.length} 筆</span>
                    {!m.applied && (
                      <button type="button" onClick={() => void apply(i, m.proposals!)} disabled={sending} className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
                        <PiCheckBold className="h-3 w-3" /> 全部採用
                      </button>
                    )}
                  </div>
                  {m.proposals.map((p, k) => (
                    <div key={k} className="flex items-start gap-2 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-100">
                      <span className="mt-0.5 flex-none rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950/30 dark:text-purple-300">{KIND_LABEL[p.kind] ?? p.kind}</span>
                      <span className="text-xs text-gray-700 dark:text-gray-700">{p.summary}</span>
                    </div>
                  ))}
                  {m.applied && (
                    <div className="flex items-center gap-1 px-1 pt-1 text-xs text-emerald-600"><PiCheckCircleFill className="h-3.5 w-3.5" /> 已套用，看板已更新</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="flex justify-start"><div className="rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-400 dark:bg-gray-200">思考中…</div></div>}
      </div>

      <div className="border-t border-gray-200 p-3 dark:border-gray-200">
        <div className="flex items-end gap-2">
          <textarea
            aria-label="給 AI 助手的訊息"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="跟 AI 說你想做的改動…（Enter 送出，Shift+Enter 換行）"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none dark:bg-gray-50 dark:text-gray-900"
          />
          {sending ? (
            <button type="button" onClick={stop} aria-label="停止" title="停止這次回應" className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600">
              <PiStopFill className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={() => void send()} disabled={!input.trim()} aria-label="送出" className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              <PiPaperPlaneRightFill className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
