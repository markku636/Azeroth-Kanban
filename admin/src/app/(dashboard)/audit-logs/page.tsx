'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PiClipboardTextDuotone,
  PiCircleFill,
  PiCaretDownBold,
  PiCaretUpBold,
} from 'react-icons/pi';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/use-translation';

interface AuditLog {
  id: string;
  actorEmail: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  create: {
    label: '新增',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  update: {
    label: '修改',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  delete: {
    label: '刪除',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

const ENTITY_TYPE_OPTIONS = [
  'Role',
  'Member',
  'Platform',
  'Product',
  'CommissionRule',
  'ReferralCode',
  'RedeemableItem',
  'WithdrawalRequest',
  'RedemptionRequest',
  'DistributorContract',
  'ContractTemplate',
  'DiscountRule',
  'SystemSetting',
];

function JsonExpander({ value }: { value: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!value) {
    return <span className="text-gray-400">—</span>;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return <span className="font-mono text-xs text-gray-500">{value}</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {expanded ? <PiCaretUpBold className="h-3 w-3" /> : <PiCaretDownBold className="h-3 w-3" />}
        {expanded ? '收起' : '展開'}
      </button>
      {expanded && (
        <pre className="mt-1 max-h-40 max-w-xs overflow-auto rounded bg-gray-100 p-2 font-mono text-xs text-gray-700">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const { t } = useTranslation();

  const [records, setRecords] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState(true);

  // ── Filters ──
  const [actorEmailFilter, setActorEmailFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchRecords = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: '20' });
        if (actorEmailFilter) {
          params.set('actorEmail', actorEmailFilter);
        }
        if (entityTypeFilter) {
          params.set('entityType', entityTypeFilter);
        }
        if (actionFilter) {
          params.set('action', actionFilter);
        }
        if (startDate) {
          params.set('startDate', startDate);
        }
        if (endDate) {
          params.set('endDate', endDate);
        }

        const res = await fetch(`/api/v1/admin/audit-logs?${params}`);
        const json = await res.json();
        if (json.success) {
          setRecords(json.data.items);
          setPagination(json.data.pagination);
        } else {
          toast.error(json.message || t('admin.auditLogs.loadFailed'));
        }
      } catch {
        toast.error(t('admin.auditLogs.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [actorEmailFilter, entityTypeFilter, actionFilter, startDate, endDate, t],
  );

  useEffect(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  const formatDateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { hour12: false });

  return (
    <div className="p-6">
      <div className="max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <PiClipboardTextDuotone className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('admin.auditLogs.title')}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{t('admin.auditLogs.description')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={actorEmailFilter}
            onChange={(e) => setActorEmailFilter(e.target.value)}
            placeholder={t('admin.auditLogs.actorEmailPlaceholder')}
            className="w-56 rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-100"
          />
          <select
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            aria-label={t('admin.auditLogs.entityType')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-100"
          >
            <option value="">{t('admin.auditLogs.allEntityTypes')}</option>
            {ENTITY_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label={t('admin.auditLogs.action')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-100"
          >
            <option value="">{t('common.all')}</option>
            <option value="create">{t('admin.auditLogs.actionCreate')}</option>
            <option value="update">{t('admin.auditLogs.actionUpdate')}</option>
            <option value="delete">{t('admin.auditLogs.actionDelete')}</option>
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label={t('admin.loginRecords.startDate')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-100"
          />
          <span className="text-sm text-gray-400">～</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label={t('admin.loginRecords.endDate')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-100"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center shadow dark:bg-gray-100">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
            <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center shadow dark:bg-gray-100">
            <PiClipboardTextDuotone className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">{t('admin.auditLogs.empty')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-0 shadow dark:bg-gray-100">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      t('admin.auditLogs.actor'),
                      t('admin.auditLogs.entityType'),
                      t('admin.auditLogs.entityId'),
                      t('admin.auditLogs.action'),
                      t('admin.auditLogs.beforeValue'),
                      t('admin.auditLogs.afterValue'),
                      t('admin.loginRecords.ipAddress'),
                      t('admin.auditLogs.operationTime'),
                    ].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {records.map((record) => {
                    const actionMeta = ACTION_LABELS[record.action];
                    return (
                      <tr key={record.id} className="transition-colors hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {record.actorEmail ?? '—'}
                          </div>
                          {record.actorName && (
                            <div className="text-xs text-gray-500">{record.actorName}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                            {record.entityType}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-mono text-xs text-gray-500">
                            {record.entityId.slice(0, 12)}…
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${actionMeta?.className ?? ''}`}
                          >
                            <PiCircleFill className="h-2 w-2" />
                            {actionMeta?.label ?? record.action}
                          </span>
                        </td>
                        <td className="max-w-[180px] px-4 py-3 text-sm text-gray-500">
                          <JsonExpander value={record.oldValue} />
                        </td>
                        <td className="max-w-[180px] px-4 py-3 text-sm text-gray-500">
                          <JsonExpander value={record.newValue} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-500">
                          {record.ipAddress ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          {formatDateTime(record.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
                <p className="text-sm text-gray-500">
                  共 {pagination.totalItems} 筆，第 {pagination.page} / {pagination.totalPages} 頁
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchRecords(pagination.page - 1)}
                    disabled={!pagination.hasPrevPage}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('common.prevPage')}
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchRecords(pagination.page + 1)}
                    disabled={!pagination.hasNextPage}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('common.nextPage')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
