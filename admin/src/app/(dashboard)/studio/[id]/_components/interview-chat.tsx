'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import { PiXBold, PiSparkleFill } from 'react-icons/pi';
import { Modal } from '@/components/modal';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export function InterviewChat({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: '嗨！想做什麼樣的短片？用一句話告訴我你的故事點子吧。' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // 新訊息／思考狀態變化時，自動捲到對話底部
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/interview/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json().catch(() => ({}));
      const d = json.data as { done?: boolean; reply?: string; shotCount?: number } | undefined;
      if (res.ok && d?.done) {
        toast.success(`已生成 ${d.shotCount ?? ''} 個分鏡`);
        setBusy(false);
        onDone();
        return;
      }
      if (res.ok) {
        setMsgs((m) => [...m, { role: 'assistant', content: d?.reply ?? '…' }]);
      } else {
        const msg = json.message ?? 'AI 對話失敗';
        toast.error(msg);
        setMsgs((m) => [...m, { role: 'assistant', content: '⚠ ' + msg }]);
      }
    } catch {
      toast.error('連線失敗，請稍後再試');
      setMsgs((m) => [...m, { role: 'assistant', content: '⚠ 連線失敗' }]);
    }
    setBusy(false);
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex h-[32rem] flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <PiSparkleFill className="h-4 w-4 text-purple-500" /> 故事訪談精靈
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 hover:text-gray-600">
            <PiXBold className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {msgs.map((m, i) => (
            <div key={`${i}-${m.role}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-800 dark:bg-gray-200 dark:text-gray-800'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300" />
              <span className="ms-1">精靈思考中…</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="flex items-end gap-2 border-t border-gray-200 p-3 dark:border-gray-300">
          <Textarea
            className="flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            disabled={busy}
            rows={2}
            autoFocus
            textareaClassName="max-h-32 resize-none"
            placeholder="輸入回覆…（Enter 送出，Shift+Enter 換行）"
          />
          <Button onClick={() => void send()} isLoading={busy} disabled={busy || !input.trim()}>
            送出
          </Button>
        </div>
      </div>
    </Modal>
  );
}
