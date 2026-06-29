'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PiXBold, PiArrowsClockwiseBold, PiGaugeBold, PiCheckCircleFill, PiWrenchBold, PiWarningCircleBold, PiCopyBold } from 'react-icons/pi';
import { Modal } from '@/components/modal';

interface AuditIssue { area: string; problem: string; fix: string }
interface Audit { score: number; verdict: string; strengths: string[]; issues: AuditIssue[]; suggestedTitle: string }

function scoreStyle(score: number): { ring: string; text: string; label: string } {
  if (score >= 80) return { ring: 'border-emerald-400', text: 'text-emerald-600', label: '很強，可以發了' };
  if (score >= 60) return { ring: 'border-sky-400', text: 'text-sky-600', label: '不錯，再磨一下' };
  if (score >= 40) return { ring: 'border-amber-400', text: 'text-amber-600', label: '可以更好' };
  return { ring: 'border-red-400', text: 'text-red-600', label: '建議大改' };
}

/**
 * 「影片健檢」：用短影音黃金法則對目前分鏡評分 + 給具體可執行的改進建議，
 * 幫使用者判斷「這支會不會紅／哪裡要改」。唯讀（不改專案）。
 */
export function AuditModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const applyTitle = async (title: string) => {
    if (!title || applying) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.code !== 0) throw new Error(json.message ?? '套用失敗');
      toast.success('已套用為專案標題');
      window.dispatchEvent(new Event('studio:reload'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '套用失敗');
    } finally {
      setApplying(false);
    }
  };

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/studio/projects/${projectId}/audit`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.code !== 0) throw new Error(json.message ?? '健檢失敗');
      setAudit(json.data?.audit ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '健檢失敗');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void run();
  }, [run]);

  const s = audit ? scoreStyle(audit.score) : null;

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-300">
          <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-900">
            <PiGaugeBold className="h-5 w-5 flex-none text-purple-500" />
            <span className="truncate">影片健檢 · 吸睛度分析</span>
          </div>
          <div className="flex flex-none items-center gap-3">
            <button type="button" onClick={() => void run()} disabled={loading} className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-primary disabled:opacity-40" title="重新健檢">
              <PiArrowsClockwiseBold className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? '分析中…' : '重新健檢'}
            </button>
            <button type="button" onClick={onClose} aria-label="關閉" className="text-gray-400 transition-colors hover:text-gray-600">
              <PiXBold className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !audit && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-gray-500">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-purple-500" />
              AI 編輯正在用短影音黃金法則檢視你的分鏡…
            </div>
          )}
          {err && !loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-sm text-gray-500">
              <PiWarningCircleBold className="h-8 w-8 text-gray-300" />
              {err}
              <button type="button" onClick={() => void run()} className="mt-1 text-primary hover:underline">再試一次</button>
            </div>
          )}
          {audit && s && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className={`flex h-20 w-20 flex-none flex-col items-center justify-center rounded-full border-4 ${s.ring}`}>
                  <span className={`text-2xl font-extrabold ${s.text}`}>{audit.score}</span>
                  <span className="text-[10px] text-gray-400">/ 100</span>
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${s.text}`}>{s.label}</div>
                  <p className="mt-0.5 text-sm text-gray-900">{audit.verdict}</p>
                </div>
              </div>

              {audit.strengths.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-gray-500">亮點</div>
                  <ul className="flex flex-col gap-1">
                    {audit.strengths.map((t, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-gray-900">
                        <PiCheckCircleFill className="mt-0.5 h-4 w-4 flex-none text-emerald-500" /> <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {audit.issues.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-gray-500">可以這樣改（依重要性）</div>
                  <div className="flex flex-col gap-2">
                    {audit.issues.map((it, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-300">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{it.area || '建議'}</span>
                          <span className="text-sm text-gray-900">{it.problem}</span>
                        </div>
                        {it.fix && (
                          <div className="flex items-start gap-1.5 rounded-md bg-purple-50 px-2.5 py-1.5 text-sm text-purple-800 dark:bg-purple-950/30 dark:text-purple-200">
                            <PiWrenchBold className="mt-0.5 h-3.5 w-3.5 flex-none" /> <span>{it.fix}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audit.suggestedTitle && (
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-300">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-500">建議標題</span>
                    <div className="flex flex-none items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void applyTitle(audit.suggestedTitle)}
                        disabled={applying}
                        className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-40"
                        title="把建議標題設為這個專案的標題"
                      >
                        <PiCheckCircleFill className="h-3.5 w-3.5" /> {applying ? '套用中…' : '套用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(audit.suggestedTitle).then(() => toast.success('已複製標題'), () => toast.error('複製失敗'))}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary"
                      >
                        <PiCopyBold className="h-3.5 w-3.5" /> 複製
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{audit.suggestedTitle}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
