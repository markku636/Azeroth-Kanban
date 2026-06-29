'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PiRobotDuotone } from 'react-icons/pi';
import { AgentPanel } from './agent-panel';

/** 浮動「AI 助手」鈕 + 側欄面板，掛在專案層 layout，所有階段頁皆可開。 */
export function AgentLauncher() {
  const params = useParams<{ id: string }>();
  const [open, setOpen] = useState(false);
  if (!params?.id) return null;
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-blue-700"
          title="開啟主動 AI 導演助手（可選 Gemini / Claude / Claude Agent）"
        >
          <PiRobotDuotone className="h-5 w-5" /> AI 助手
        </button>
      )}
      {open && (
        // 半透明背幕：給出「這是覆蓋層」的視覺提示，並支援點外面關閉（與其他 Modal 一致）。
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      <AgentPanel projectId={params.id} open={open} onClose={() => setOpen(false)} onApplied={() => { /* board 透過 studio:reload 事件重載 */ }} />
    </>
  );
}
