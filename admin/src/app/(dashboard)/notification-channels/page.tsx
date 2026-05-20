'use client';

/**
 * 通知通道管理頁 —— 設定 SLACK_WEBHOOK / GENERIC_WEBHOOK / CONSOLE 通道,
 * 給 Monitor 用於 down / recovery / re-alert 時推播。
 *
 * 操作:列表 + 新增 + 編輯 + 刪除 + 測試訊息(發一條假事件確認通道可用)。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  PiPlusBold,
  PiBellRingingDuotone,
  PiPencilSimpleBold,
  PiTrashBold,
  PiPaperPlaneBold,
} from 'react-icons/pi';
import toast from 'react-hot-toast';

import { PERMISSIONS } from '@/config/permissions';
import StatusBadge from '@/components/status-badge';
import { useHasPermission } from '@/hooks/use-permissions';

type ChannelKind = 'SLACK_WEBHOOK' | 'GENERIC_WEBHOOK' | 'CONSOLE';

interface ChannelRow {
  id: string;
  name: string;
  kind: ChannelKind;
  config: Record<string, unknown>;
  enabled: boolean;
  linkedMonitorCount: number;
  owner: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

const KIND_LABEL: Record<ChannelKind, string> = {
  SLACK_WEBHOOK: 'Slack',
  GENERIC_WEBHOOK: 'Webhook',
  CONSOLE: 'Console',
};

export default function NotificationChannelsPage() {
  const canCreate = useHasPermission(PERMISSIONS.NOTIFICATION_CHANNELS_CREATE);
  const canEdit = useHasPermission(PERMISSIONS.NOTIFICATION_CHANNELS_EDIT);
  const canDelete = useHasPermission(PERMISSIONS.NOTIFICATION_CHANNELS_DELETE);

  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notification-channels');
      const json = await res.json();
      if (json.success) {
        setChannels(json.data ?? []);
      } else {
        toast.error(json.message ?? '載入通知通道失敗');
      }
    } catch {
      toast.error('載入通知通道失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleDelete = async (row: ChannelRow) => {
    if (!confirm(`確定刪除通道「${row.name}」?`)) return;
    try {
      const res = await fetch(`/api/v1/notification-channels/${row.id}`, { method: 'DELETE' });
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

  const handleTest = async (row: ChannelRow) => {
    try {
      const res = await fetch(`/api/v1/notification-channels/${row.id}/test`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success(`已對「${row.name}」發送測試訊息`);
      } else {
        toast.error(json.message ?? '測試失敗');
      }
    } catch {
      toast.error('測試失敗');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <PiBellRingingDuotone className="h-6 w-6 text-blue-600" />
            通知通道
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            設定 Slack / Generic Webhook / Console 通道,連到 Monitor 後在事故 down/recovery/re-alert 時推播。
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PiPlusBold className="h-4 w-4" />
            新增通道
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center shadow dark:bg-gray-100">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center text-sm text-gray-500 shadow dark:bg-gray-100">
          尚未設定任何通知通道。點右上角「新增通道」開始。
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-0 shadow dark:bg-gray-100">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-200/30">
              <tr>
                <th className="px-4 py-2 font-medium">狀態</th>
                <th className="px-4 py-2 font-medium">名稱</th>
                <th className="px-4 py-2 font-medium">種類</th>
                <th className="px-4 py-2 font-medium">設定摘要</th>
                <th className="px-4 py-2 font-medium">綁定監控數</th>
                <th className="px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-200/20">
                  <td className="px-4 py-2">
                    <StatusBadge
                      status={c.enabled ? 'success' : 'free'}
                      label={c.enabled ? '啟用' : '停用'}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-2 text-gray-600">{KIND_LABEL[c.kind]}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {summarizeConfig(c.kind, c.config)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.linkedMonitorCount}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && (
                        <button
                          onClick={() => void handleTest(c)}
                          className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                          title="發送一條測試訊息"
                        >
                          <PiPaperPlaneBold className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setEditing(c)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          title="編輯"
                        >
                          <PiPencilSimpleBold className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => void handleDelete(c)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          title="刪除"
                          disabled={c.linkedMonitorCount > 0}
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
      )}

      {createOpen && (
        <ChannelModal
          mode="create"
          initial={null}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            void fetchAll();
          }}
        />
      )}
      {editing && (
        <ChannelModal
          mode="edit"
          initial={editing}
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

function summarizeConfig(kind: ChannelKind, config: Record<string, unknown>): string {
  if (kind === 'SLACK_WEBHOOK') {
    const url = typeof config.webhookUrl === 'string' ? config.webhookUrl : '';
    return url ? maskUrl(url) : '(未設定 webhookUrl)';
  }
  if (kind === 'GENERIC_WEBHOOK') {
    const url = typeof config.url === 'string' ? config.url : '';
    return url ? maskUrl(url) : '(未設定 url)';
  }
  return '(輸出到 admin 容器 console)';
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.slice(0, 18)}${u.pathname.length > 18 ? '…' : ''}`;
  } catch {
    return url.slice(0, 60);
  }
}

// ── Modal ───────────────────────────────────────────────────────────────────
interface ModalProps {
  mode: 'create' | 'edit';
  initial: ChannelRow | null;
  onClose: () => void;
  onSaved: () => void;
}

function ChannelModal({ mode, initial, onClose, onSaved }: ModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ChannelKind>(initial?.kind ?? 'SLACK_WEBHOOK');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [webhookUrl, setWebhookUrl] = useState(
    typeof initial?.config?.webhookUrl === 'string' ? (initial.config.webhookUrl as string) : '',
  );
  const [genericUrl, setGenericUrl] = useState(
    typeof initial?.config?.url === 'string' ? (initial.config.url as string) : '',
  );
  const [headersText, setHeadersText] = useState(
    initial && typeof initial.config?.headers === 'object'
      ? JSON.stringify(initial.config.headers, null, 2)
      : '',
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('名稱必填');
      return;
    }
    const config: Record<string, unknown> = {};
    if (kind === 'SLACK_WEBHOOK') config.webhookUrl = webhookUrl.trim();
    if (kind === 'GENERIC_WEBHOOK') {
      config.url = genericUrl.trim();
      if (headersText.trim()) {
        try {
          config.headers = JSON.parse(headersText);
        } catch {
          toast.error('headers 須為合法 JSON');
          return;
        }
      }
    }
    const payload: Record<string, unknown> = { name: name.trim(), kind, enabled, config };
    setSaving(true);
    try {
      const url =
        mode === 'create' ? '/api/v1/notification-channels' : `/api/v1/notification-channels/${initial!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(mode === 'create' ? '通道已建立' : '通道已更新');
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
            <PiBellRingingDuotone className="h-5 w-5 text-blue-600" />
            {mode === 'create' ? '新增通知通道' : '編輯通知通道'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="名稱 *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="例如:slack-#oncall"
              />
            </Field>
            <Field label="種類">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ChannelKind)}
                className={inputCls}
                disabled={mode === 'edit'}
                title={mode === 'edit' ? '不可變更通道種類' : ''}
              >
                <option value="SLACK_WEBHOOK">Slack Webhook</option>
                <option value="GENERIC_WEBHOOK">Generic Webhook</option>
                <option value="CONSOLE">Console(印到 admin log)</option>
              </select>
            </Field>
          </div>

          {kind === 'SLACK_WEBHOOK' && (
            <Field label="Slack Webhook URL *">
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className={inputCls}
                placeholder="https://hooks.slack.com/services/..."
              />
            </Field>
          )}

          {kind === 'GENERIC_WEBHOOK' && (
            <>
              <Field label="Webhook URL *">
                <input
                  value={genericUrl}
                  onChange={(e) => setGenericUrl(e.target.value)}
                  className={inputCls}
                  placeholder="https://example.com/hooks/incident"
                />
              </Field>
              <Field label="自訂 HTTP 標頭(JSON,可選)">
                <textarea
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                  rows={3}
                  placeholder='{"Authorization": "Bearer xxx"}'
                />
              </Field>
            </>
          )}

          {kind === 'CONSOLE' && (
            <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-200/30">
              CONSOLE 通道把通知 console.log 到 admin 容器,適合 dev / demo 驗證。可在 docker logs admin -f 看到。
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-gray-700">啟用此通道</span>
          </label>
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
