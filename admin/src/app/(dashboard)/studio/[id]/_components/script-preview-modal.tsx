'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { PiXBold, PiSpeakerHighBold, PiPlayFill, PiStopFill, PiSpinnerGapBold, PiCopyBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';

interface ShotLite { id: string; shotNo: number; tts: string | null; emotion?: string | null; characterId?: string | null }
interface SceneLite { id: string; title: string; shots: ShotLite[] }

/** 腳本（旁白）預覽：列出每鏡台詞＋情緒，逐句或全部試聽（用與生成相同的聲音設定，含情緒 instruct）。 */
export function ScriptPreviewModal({
  scenes,
  charNames,
  onClose,
}: {
  scenes: SceneLite[];
  charNames: Record<string, string>;
  onClose: () => void;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [allMode, setAllMode] = useState(false);
  const cancelRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const lines = scenes.flatMap((s) => s.shots.filter((sh) => sh.tts?.trim()).map((sh) => ({ ...sh, sceneTitle: s.title })));

  const playOne = async (shotId: string): Promise<boolean> => {
    setPlayingId(shotId);
    let url = '';
    try {
      const res = await fetch(`/api/v1/studio/shots/${shotId}/preview-voice`, { method: 'POST' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? '試聽失敗'); }
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = audioRef.current;
      if (a) {
        a.src = url;
        await new Promise<void>((resolve) => { a.onended = () => resolve(); a.onerror = () => resolve(); void a.play().catch(() => resolve()); });
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '試聽失敗');
      return false;
    } finally {
      if (url) URL.revokeObjectURL(url);
      setPlayingId(null);
    }
  };

  const playAll = async () => {
    cancelRef.current = false;
    setAllMode(true);
    for (const ln of lines) {
      if (cancelRef.current) break;
      const ok = await playOne(ln.id);
      if (!ok) break;
    }
    setAllMode(false);
  };

  const stopAll = () => { cancelRef.current = true; audioRef.current?.pause(); };

  // 複製整份旁白腳本（依分鏡順序、含鏡號與角色），供 teleprompter／字幕／審稿外用。
  const copyScript = () => {
    if (!lines.length) { toast('沒有旁白可複製'); return; }
    const text = lines
      .map((ln) => `#${ln.shotNo}${ln.characterId && charNames[ln.characterId] ? ` [${charNames[ln.characterId]}]` : ''} ${ln.tts ?? ''}`.trim())
      .join('\n');
    navigator.clipboard.writeText(text).then(() => toast.success('已複製旁白腳本'), () => toast.error('複製失敗'));
  };

  return (
    <Modal isOpen onClose={() => { stopAll(); onClose(); }} size="lg">
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <PiSpeakerHighBold className="h-5 w-5 text-sky-500" /> 旁白預覽（{lines.length} 句）
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={copyScript} disabled={lines.length === 0} title="複製整份旁白腳本" className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary disabled:opacity-40">
              <PiCopyBold className="h-4 w-4" /> 複製腳本
            </button>
            {allMode ? (
              <button type="button" onClick={stopAll} className="flex items-center gap-1 rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600">
                <PiStopFill className="h-4 w-4" /> 停止
              </button>
            ) : (
              <button type="button" onClick={() => void playAll()} disabled={lines.length === 0 || !!playingId} className="flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-40">
                <PiPlayFill className="h-4 w-4" /> 全部試聽
              </button>
            )}
            <button type="button" onClick={() => { stopAll(); onClose(); }} aria-label="關閉" className="text-gray-400 hover:text-gray-600"><PiXBold className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">尚無任何旁白台詞（在分鏡填「旁白／台詞 tts」）。</div>
          ) : (
            <div className="space-y-1.5">
              {lines.map((ln) => {
                const active = playingId === ln.id;
                return (
                  <div key={ln.id} className={`flex items-start gap-2 rounded-lg border p-2 ${active ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' : 'border-gray-200 dark:border-gray-200'}`}>
                    <span className="mt-0.5 flex-none text-xs font-medium text-blue-600">#{ln.shotNo}</span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        {ln.characterId && charNames[ln.characterId] && (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">🎭 {charNames[ln.characterId]}</span>
                        )}
                        {ln.emotion?.trim() ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">情緒：{ln.emotion}</span>
                        ) : (
                          <span className="text-[11px] text-gray-300">（無情緒設定）</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-700">{ln.tts}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void playOne(ln.id)}
                      disabled={!!playingId || allMode}
                      aria-label="試聽這句"
                      title="試聽這句（帶情緒）"
                      className="flex-none rounded-md border border-sky-300 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-40 dark:border-sky-700 dark:text-sky-300"
                    >
                      {active ? <PiSpinnerGapBold className="h-3.5 w-3.5 animate-spin" /> : <PiSpeakerHighBold className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">試聽用與「② 生成影片」完全相同的聲音設定（speaker＋角色 lora／引擎＋情緒 instruct）。需 Seal-TTS 服務啟動。</p>
        </div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} hidden />
      </div>
    </Modal>
  );
}
