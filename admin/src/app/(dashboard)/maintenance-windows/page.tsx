'use client';

/**
 * 維護視窗管理頁 —— 設定全域或單一監控的維護期,引擎在期間內跳過告警。
 *
 * 操作:列表(過去 / 進行中 / 即將到來分組)+ 新增 + 編輯 + 刪除。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiPlusBold, PiClockCountdownDuotone, PiPencilSimpleBold, PiTrashBold } from 'react-icons/pi';
import toast from 'react-hot-toast';

import { PERMISSIONS } from '@/config/permissions';
import StatusBadge, { type StatusType } from '@/components/status-badge';
import { useHasPermission } from '@/hooks/use-permissions';

interface MaintenanceWindowRow {
  id: string;
  monitorId: string | null;
  monitor: { id: string; name: string } | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  status: 'past' | 'active' | 'upcoming';
}

interface MonitorOpt {
  id: string;
  name: string;
}

const STATUS_COLOR: Record<MaintenanceWindowRow['status'], StatusType> = {
  past: 'free',
  active: 'info',
  upcoming: 'pending',
};
const STATUS_LABEL: Record<MaintenanceWindowRow['status'], string> = {
  past: '已結束',
  active: '進行中',
  upcoming: '即將到來',
};

export default function MaintenanceWindowsPage() {
  const canCreate = useHasPermission(PERMISSIONS.MAINTENANCE_WINDOWS_CREATE);
  const canEdit = useHasPermission(PERMISSIONS.MAINTENANCE_WINDOWS_EDIT);
  const canDelete = useHasPermission(PERMISSIONS.MAINTENANCE_WINDOWS_DELETE);

  const [rows, setRows] = useState<MaintenanceWindowRow[]>([]);
  const [monitors, setMonitors] = useState<MonitorOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceWindowRow | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [mwRes, mRes] = await Promise.all([
        fetch('/api/v1/maintenance-windows'),
        fetch('/api/v1/monitors'),
      ]);
      const mwJson = await mwRes.json();
      const mJson = await mRes.json();
      if (mwJson.success) setRows(mwJson.data ?? []);
      else toast.error(mwJson.message ?? '載入維護視窗失敗');
      if (mJson.success) {
        setMonitors(
          (mJson.data ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })),
        );
      }
    } catch {
      toast.error('載入維護視窗失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
    const timer = setInterval(fetchAll, 30_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const grouped = useMemo(() => {
    const active = rows.filter((r) => r.status === 'active');
    const upcoming = rows.filter((r) => r.status === 'upcoming');
    const past = rows.filter((r) => r.status === 'past').slice(0, 20);
    return { active, upcoming, past };
  }, [rows]);

  const handleDelete = async (row: MaintenanceWindowRow) => {
    if (!confirm(`確定刪除這個維護視窗?`)) return;
    try {
      const res = await fetch(`/api/v1/maintenance-windows/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('已刪除');
        void fetchAll();
      } else {
        toast.error(json.message ?? '刪除失敗');
      }
    } catch {
      toast.error('刪除失敗');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <PiClockCountdownDuotone className="h-6 w-6 text-blue-600" />
            維護視窗
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            排程維護期內,引擎仍會檢查但跳過狀態機、不開事故,適合計畫性部署 / 演練時抑制告警。
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PiPlusBold className="h-4 w-4" />
            新增視窗
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center shadow dark:bg-gray-100">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center text-sm text-gray-500 shadow dark:bg-gray-100">
          尚未排定任何維護視窗。點右上角「新增視窗」開始。
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.active.length > 0 && <Section title="進行中" rows={grouped.active} {...{ canEdit, canDelete, setEditing, handleDelete }} />}
          {grouped.upcoming.length > 0 && (
            <Section title="即將到來" rows={grouped.upcoming} {...{ canEdit, canDelete, setEditing, handleDelete }} />
          )}
          {grouped.past.length > 0 && (
            <Section title={`已結束(最近 ${grouped.past.length} 筆)`} rows={grouped.past} {...{ canEdit, canDelete, setEditing, handleDelete }} />
          )}
        </div>
      )}

      {createOpen && (
        <MWModal
          mode="create"
          initial={null}
          monitors={monitors}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            void fetchAll();
          }}
        />
      )}
      {editing && (
        <MWModal
          mode="edit"
          initial={editing}
          monitors={monitors}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void fetchAll();
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  canEdit,
  canDelete,
  setEditing,
  handleDelete,
}: {
  title: string;
  rows: MaintenanceWindowRow[];
  canEdit: boolean;
  canDelete: boolean;
  setEditing: (r: MaintenanceWindowRow) => void;
  handleDelete: (r: MaintenanceWindowRow) => void;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase text-gray-400">{title}</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-0 shadow dark:bg-gray-100">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-200/30">
            <tr>
              <th className="px-4 py-2 font-medium">狀態</th>
              <th className="px-4 py-2 font-medium">範圍</th>
              <th className="px-4 py-2 font-medium">開始</th>
              <th className="px-4 py-2 font-medium">結束</th>
              <th className="px-4 py-2 font-medium">原因</th>
              <th className="px-4 py-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-200/20">
                <td className="px-4 py-2">
                  <StatusBadge status={STATUS_COLOR[r.status]} label={STATUS_LABEL[r.status]} size="sm" />
                </td>
                <td className="px-4 py-2 text-gray-700">{r.monitor ? r.monitor.name : <span className="italic text-gray-500">全域(所有監控)</span>}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{new Date(r.startsAt).toLocaleString('zh-TW')}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{new Date(r.endsAt).toLocaleString('zh-TW')}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{r.reason ?? '-'}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {canEdit && (
                      <button
                        onClick={() => setEditing(r)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        title="編輯"
                      >
                        <PiPencilSimpleBold className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(r)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        title="刪除"
                      >
                        <PiTrashBold className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
interface ModalProps {
  mode: 'create' | 'edit';
  initial: MaintenanceWindowRow | null;
  monitors: MonitorOpt[];
  onClose: () => void;
  onSaved: () => void;
}

function MWModal({ mode, initial, monitors, onClose, onSaved }: ModalProps) {
  const [monitorId, setMonitorId] = useState(initial?.monitorId ?? '');
  const [startsAt, setStartsAt] = useState(initial ? toLocalInput(initial.startsAt) : toLocalInput(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(
    initial ? toLocalInput(initial.endsAt) : toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString()),
  );
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('時間格式不正確');
      return;
    }
    if (start.getTime() >= end.getTime()) {
      toast.error('開始時間須早於結束時間');
      return;
    }
    const payload: Record<string, unknown> = {
      monitorId: monitorId || null,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      reason: reason.trim() || null,
    };
    setSaving(true);
    try {
      const url =
        mode === 'create' ? '/api/v1/maintenance-windows' : `/api/v1/maintenance-windows/${initial!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(mode === 'create' ? '維護視窗已建立' : '已更新');
        onSaved();
      } else {
        toast.error(json.message ?? '儲存失敗');
      }
    } catch {
      toast.error('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl dark:bg-gray-100">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <PiClockCountdownDuotone className="h-5 w-5 text-blue-600" />
            {mode === 'create' ? '新增維護視窗' : '編輯維護視窗'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Field label="作用範圍">
            <select value={monitorId} onChange={(e) => setMonitorId(e.target.value)} className={inputCls}>
              <option value="">全域(所有監控)</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始時間 *">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="結束時間 *">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="原因(可選,最多 300 字)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="例如:計畫性部署 v2.5"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '儲存中...' : mode === 'create' ? '建立' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-gray-300 bg-gray-0 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:bg-gray-100';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

/** ISO 字串 → datetime-local 輸入(YYYY-MM-DDTHH:mm,以使用者本地時區呈現)。 */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
