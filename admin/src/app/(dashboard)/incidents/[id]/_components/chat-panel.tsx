'use client';

/**
 * 「追問 Selkie」面板 —— 事故詳情頁底部的對話區。
 *
 * triage 成功後啟用:使用者可針對該事故與 Selkie 對話(沿用調查脈絡)。
 * POST /chat 為同步呼叫,Selkie 思考可能需數十秒,送出期間顯示等待狀態。
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { PiPaperPlaneRightBold, PiRobotDuotone, PiUserDuotone } from 'react-icons/pi';
import toast from 'react-hot-toast';

interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

interface ChatPanelProps {
  incidentId: string;
  /** 是否已有一次成功的 triage —— 沒有就不能追問 */
  enabled: boolean;
  /** 使用者是否有觸發調查 / 追問的權限 */
  canChat: boolean;
}

/** Selkie 回覆的 Markdown 排版(本專案未裝 @tailwindcss/typography)。 */
const MD_CLASS =
  'text-sm leading-relaxed text-gray-700 dark:text-gray-300 ' +
  '[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-gray-900 ' +
  '[&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-gray-900 ' +
  '[&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:font-bold [&_h2]:text-gray-900 ' +
  '[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-gray-900 ' +
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs ' +
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-gray-100 [&_pre]:p-3';

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'USER';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="mt-0.5 shrink-0">
        {isUser ? (
          <PiUserDuotone className="h-7 w-7 text-gray-400" />
        ) : (
          <PiRobotDuotone className="h-7 w-7 text-blue-600" />
        )}
      </div>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-lg bg-blue-600 px-3.5 py-2.5 text-white'
            : 'max-w-[80%] rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:bg-gray-200/40'
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className={MD_CLASS}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel({ incidentId, enabled, canChat }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}/chat`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data ?? []);
      }
    } catch {
      /* 載入歷史失敗時靜默,不阻斷追問 */
    }
  }, [incidentId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // 新訊息 / 等待狀態變動時捲到底
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'USER',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const json = await res.json();
      if (json.success && json.data?.reply) {
        // 重新載入:使用者問句與 Selkie 回覆均已落地,以伺服器資料為準
        await loadMessages();
      } else {
        toast.error(json.message || 'Selkie 回覆失敗');
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(text);
      }
    } catch {
      toast.error('Selkie 回覆失敗');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-0 shadow dark:bg-gray-100">
      <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-3">
        <PiRobotDuotone className="h-5 w-5 text-blue-600" />
        <h2 className="font-semibold text-gray-900">追問 Selkie</h2>
        <span className="text-xs text-gray-400">針對這次事故繼續與 Selkie 對話</span>
      </div>

      <div className="p-5">
        {messages.length > 0 && (
          <div ref={listRef} className="mb-4 max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 pl-9 text-sm text-gray-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
                Selkie 思考中...(沿用調查脈絡,可能需數十秒)
              </div>
            )}
          </div>
        )}

        {enabled ? (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || !canChat}
              rows={2}
              placeholder={
                canChat
                  ? '例如:為什麼判定是這個根因?下一步該怎麼處置?(Enter 送出,Shift+Enter 換行)'
                  : '你沒有追問 Selkie 的權限'
              }
              className="min-h-[2.75rem] flex-1 resize-y rounded-md border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-100"
            />
            <button
              onClick={() => void handleSend()}
              disabled={sending || !canChat || !input.trim()}
              className="inline-flex h-[2.75rem] shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <PiPaperPlaneRightBold className="h-4 w-4" />
              送出
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {messages.length > 0
              ? '目前無法追問:Selkie 尚未完成最新一次調查。'
              : '完成一次 Selkie 調查後,即可在此追問細節 —— 例如「為什麼判定是這個根因?」「下一步該怎麼處置?」'}
          </p>
        )}
      </div>
    </div>
  );
}
