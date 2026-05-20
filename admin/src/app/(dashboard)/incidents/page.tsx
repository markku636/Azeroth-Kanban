'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PiPlusBold, PiWarningOctagonDuotone } from 'react-icons/pi';
import toast from 'react-hot-toast';
import { PERMISSIONS } from '@/config/permissions';
import DataTable, { type Column } from '@/components/data-table';
import StatusBadge, { type StatusType } from '@/components/status-badge';
import { useHasPermission } from '@/hooks/use-permissions';

interface IncidentRow {
  id: string;
  code: string;
  title: string;
  service: string;
  status: string;
  severity: string | null;
  source: string;
  createdAt: string;
  owner: { id: string; name: string; email: string };
  latestRun: { id: string; status: string; createdAt: string } | null;
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
const RUN_LABEL: Record<string, string> = {
  QUEUED: '排隊中',
  RUNNING: 'Selkie 調查中',
  SUCCEEDED: '報告完成',
  FAILED: '調查失敗',
};
const RUN_COLOR: Record<string, StatusType> = {
  QUEUED: 'pending',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'error',
};

export default function IncidentsPage() {
  const router = useRouter();
  const canCreate = useHasPermission(PERMISSIONS.INCIDENTS_CREATE);

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [fTitle, setFTitle] = useState('');
  const [fService, setFService] = useState('');
  const [fSeverity, setFSeverity] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/incidents');
      const json = await res.json();
      if (json.success) {
        setIncidents(json.data);
      } else {
        toast.error(json.message || '載入事故失敗');
      }
    } catch {
      toast.error('載入事故失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const resetForm = () => {
    setFTitle('');
    setFService('');
    setFSeverity('');
    setFDescription('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fTitle.trim() || !fService.trim()) {
      toast.error('事故標題與受影響服務為必填');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: fTitle.trim(),
          service: fService.trim(),
          severity: fSeverity || undefined,
          description: fDescription.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('事故已建立');
        setShowCreate(false);
        resetForm();
        router.push(`/incidents/${json.data.id}`);
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error('建立事故失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<IncidentRow>[] = [
    {
      key: 'code',
      header: '事故編號',
      render: (i) => <span className="font-mono text-xs text-gray-500">{i.code}</span>,
    },
    {
      key: 'title',
      header: '標題',
      render: (i) => <span className="font-medium text-gray-900">{i.title}</span>,
    },
    {
      key: 'service',
      header: '服務',
      render: (i) => <span className="font-mono text-xs">{i.service}</span>,
    },
    {
      key: 'severity',
      header: '嚴重度',
      render: (i) =>
        i.severity ? (
          <StatusBadge status={SEVERITY_COLOR[i.severity] ?? 'info'} label={i.severity} size="sm" />
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'status',
      header: '狀態',
      render: (i) => (
        <StatusBadge
          status={STATUS_COLOR[i.status] ?? 'info'}
          label={STATUS_LABEL[i.status] ?? i.status}
          size="sm"
        />
      ),
    },
    {
      key: 'triage',
      header: 'Selkie',
      render: (i) =>
        i.latestRun ? (
          <StatusBadge
            status={RUN_COLOR[i.latestRun.status] ?? 'info'}
            label={RUN_LABEL[i.latestRun.status] ?? i.latestRun.status}
            size="sm"
          />
        ) : (
          <span className="text-xs text-gray-400">未調查</span>
        ),
    },
    {
      key: 'createdAt',
      header: '建立時間',
      render: (i) => (
        <span className="text-xs text-gray-500">
          {new Date(i.createdAt).toLocaleString('zh-TW')}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <PiWarningOctagonDuotone className="h-7 w-7 text-blue-600" />
              事故管理
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              建立事故,並讓 Selkie AI agent 自動 triage 調查、產出診斷報告。
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => {
                resetForm();
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <PiPlusBold className="h-4 w-4" />
              新增事故
            </button>
          )}
        </div>

        <DataTable<IncidentRow>
          data={incidents}
          columns={columns}
          keyExtractor={(i) => i.id}
          loading={loading}
          emptyMessage="目前沒有事故,點右上角「新增事故」開始。"
          onRowClick={(i) => router.push(`/incidents/${i.id}`)}
          rowClassName="cursor-pointer"
        />
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-gray-0 p-6 shadow-xl dark:bg-gray-100">
            <h2 className="mb-4 text-lg font-bold text-gray-900">新增事故</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  事故標題 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  placeholder="例如:checkout-api 5xx 錯誤率飆升"
                  className="block w-full rounded-md border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:bg-gray-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  受影響服務 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fService}
                  onChange={(e) => setFService(e.target.value)}
                  placeholder="例如:checkout-api"
                  className="block w-full rounded-md border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:bg-gray-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  嚴重度（可留空,讓 Selkie 評估）
                </label>
                <select
                  value={fSeverity}
                  onChange={(e) => setFSeverity(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:bg-gray-100"
                >
                  <option value="">未指定</option>
                  <option value="SEV1">SEV1 — 重大</option>
                  <option value="SEV2">SEV2 — 高</option>
                  <option value="SEV3">SEV3 — 中</option>
                  <option value="SEV4">SEV4 — 低</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">事故描述</label>
                <textarea
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  rows={3}
                  placeholder="告警內容、症狀描述..."
                  className="block w-full rounded-md border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:bg-gray-100"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  建立事故
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
