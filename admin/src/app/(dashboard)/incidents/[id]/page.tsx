'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import {
  PiArrowLeftBold,
  PiArrowsClockwiseBold,
  PiRobotDuotone,
  PiWarningOctagonDuotone,
} from 'react-icons/pi';
import toast from 'react-hot-toast';
import { PERMISSIONS } from '@/config/permissions';
import StatusBadge, { type StatusType } from '@/components/status-badge';
import { useHasPermission } from '@/hooks/use-permissions';
import ChatPanel from './_components/chat-panel';

interface IncidentDetail {
  id: string;
  code: string;
  title: string;
  service: string;
  description: string | null;
  source: string;
  status: string;
  severity: string | null;
  triggeredAt: string;
  createdAt: string;
  owner: { id: string; name: string; email: string };
  latestRun: { id: string; status: string; createdAt: string } | null;
}

interface AgentRun {
  id: string;
  incidentId: string;
  status: string;
  finalSummary: string | null;
  reportMarkdown: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  TRIGGERED: '已觸發',
  INVESTIGATING: '調查中',
  MITIGATING: '緩解中',
  RESOLVED: '已解決',
};
const STATUS_COLOR: Record<string, StatusType> = {
  TRIGGERED: 'error',
  INVESTIGATING: 'warning',
  MITIGATING: 'info',
  RESOLVED: 'success',
};
const SEVERITY_COLOR: Record<string, StatusType> = {
  SEV1: 'error',
  SEV2: 'warning',
  SEV3: 'info',
  SEV4: 'free',
};
const INCIDENT_STATUSES = ['TRIGGERED', 'INVESTIGATING', 'MITIGATING', 'RESOLVED'];

/** Markdown 內容的基本排版（本專案未裝 @tailwindcss/typography,以 arbitrary variant 提供樣式）。 */
const MD_CLASS =
  'text-sm leading-relaxed text-gray-700 dark:text-gray-300 ' +
  '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 ' +
  '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 ' +
  '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-gray-900 ' +
  '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_hr]:my-3 [&_hr]:border-gray-200 ' +
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs ' +
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-gray-100 [&_pre]:p-3';

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const canTriage = useHasPermission(PERMISSIONS.INCIDENTS_TRIAGE);
  const canEdit = useHasPermission(PERMISSIONS.INCIDENTS_EDIT);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const fetchRun = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/v1/agent-runs/${runId}`);
      const json = await res.json();
      if (json.success) {
        setRun(json.data);
      }
    } catch {
      /* 輪詢失敗時靜默,下次再試 */
    }
  }, []);

  const fetchIncident = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/incidents/${id}`);
      const json = await res.json();
      if (json.success) {
        setIncident(json.data);
        if (json.data.latestRun) {
          void fetchRun(json.data.latestRun.id);
        }
      } else {
        toast.error(json.message || '載入事故失敗');
      }
    } catch {
      toast.error('載入事故失敗');
    } finally {
      setLoading(false);
    }
  }, [id, fetchRun]);

  useEffect(() => {
    void fetchIncident();
  }, [fetchIncident]);

  // 輪詢:run 為 QUEUED / RUNNING 時每 3 秒更新一次,直到結束。
  useEffect(() => {
    const status = run?.status;
    if (!run || (status !== 'QUEUED' && status !== 'RUNNING')) {
      return;
    }
    const timer = setInterval(() => {
      void fetchRun(run.id);
    }, 3000);
    return () => clearInterval(timer);
  }, [run, fetchRun]);

  const handleTriage = async () => {
    setTriggering(true);
    try {
      const res = await fetch(`/api/v1/incidents/${id}/triage`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success('Selkie 已開始調查');
        setRun(json.data);
      } else {
        toast.error(json.message || '觸發調查失敗');
      }
    } catch {
      toast.error('觸發調查失敗');
    } finally {
      setTriggering(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/v1/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        setIncident(json.data);
        toast.success('事故狀態已更新');
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error('更新狀態失敗');
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center shadow dark:bg-gray-100">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
          <p className="mt-4 text-sm text-gray-500">載入中...</p>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">找不到事故。</p>
        <button
          onClick={() => router.push('/incidents')}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          ← 回事故列表
        </button>
      </div>
    );
  }

  const isRunning = run?.status === 'QUEUED' || run?.status === 'RUNNING';

  return (
    <div className="p-6">
      <div className="max-w-4xl">
        <button
          onClick={() => router.push('/incidents')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <PiArrowLeftBold className="h-3.5 w-3.5" />
          回事故列表
        </button>

        {/* 標題列 */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <PiWarningOctagonDuotone className="h-6 w-6 shrink-0 text-blue-600" />
              <span className="font-mono text-xs text-gray-500">{incident.code}</span>
              <StatusBadge
                status={STATUS_COLOR[incident.status] ?? 'info'}
                label={STATUS_LABEL[incident.status] ?? incident.status}
                size="sm"
              />
              {incident.severity && (
                <StatusBadge
                  status={SEVERITY_COLOR[incident.severity] ?? 'info'}
                  label={incident.severity}
                  size="sm"
                />
              )}
            </div>
            <h1 className="mt-1.5 text-xl font-bold text-gray-900">{incident.title}</h1>
          </div>
          {canEdit && (
            <select
              value={incident.status}
              disabled={savingStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="shrink-0 rounded-md border border-gray-300 bg-gray-0 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-100"
            >
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* metadata */}
        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-gray-200 bg-gray-0 p-5 text-sm shadow dark:bg-gray-100 md:grid-cols-3">
          <div>
            <div className="text-xs text-gray-400">受影響服務</div>
            <div className="mt-0.5 font-mono text-gray-900">{incident.service}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">來源</div>
            <div className="mt-0.5 text-gray-900">{incident.source}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">負責人</div>
            <div className="mt-0.5 text-gray-900">{incident.owner.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">觸發時間</div>
            <div className="mt-0.5 text-gray-900">
              {new Date(incident.triggeredAt).toLocaleString('zh-TW')}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">建立時間</div>
            <div className="mt-0.5 text-gray-900">
              {new Date(incident.createdAt).toLocaleString('zh-TW')}
            </div>
          </div>
          {incident.description && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-xs text-gray-400">描述</div>
              <div className="mt-0.5 whitespace-pre-wrap text-gray-700">{incident.description}</div>
            </div>
          )}
        </div>

        {/* Selkie 調查區 */}
        <div className="rounded-lg border border-gray-200 bg-gray-0 shadow dark:bg-gray-100">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900">
              <PiRobotDuotone className="h-5 w-5 text-blue-600" />
              Selkie 事故診斷
            </h2>
            {canTriage && !isRunning && (
              <button
                onClick={handleTriage}
                disabled={triggering}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {run ? (
                  <PiArrowsClockwiseBold className="h-3.5 w-3.5" />
                ) : (
                  <PiRobotDuotone className="h-4 w-4" />
                )}
                {run ? '重新調查' : '讓 Selkie 調查'}
              </button>
            )}
          </div>

          <div className="p-5">
            {!run && (
              <p className="text-sm text-gray-500">
                尚未調查。{canTriage ? '點右上角「讓 Selkie 調查」,agent 會自動分析日誌、metrics、近期部署並產出診斷報告。' : '你沒有觸發調查的權限。'}
              </p>
            )}

            {isRunning && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
                <span>Selkie 正在調查中...(deep agent 規劃並委派 subagent,約需 1–3 分鐘,本頁會自動更新)</span>
              </div>
            )}

            {run?.status === 'FAILED' && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">調查失敗</p>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-red-600 dark:text-red-400">
                  {run.error ?? '未知錯誤'}
                </pre>
              </div>
            )}

            {run?.status === 'SUCCEEDED' && (
              <div className="space-y-4">
                {run.finalSummary && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                    <p className="mb-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                      triage 摘要
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {run.finalSummary}
                    </p>
                  </div>
                )}
                {run.reportMarkdown ? (
                  <div className={MD_CLASS}>
                    <ReactMarkdown>{run.reportMarkdown}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">(agent 未產出 incident-report.md)</p>
                )}
                {run.finishedAt && (
                  <p className="text-xs text-gray-400">
                    完成於 {new Date(run.finishedAt).toLocaleString('zh-TW')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <ChatPanel
          incidentId={id}
          enabled={run?.status === 'SUCCEEDED'}
          canChat={canTriage}
        />
      </div>
    </div>
  );
}
