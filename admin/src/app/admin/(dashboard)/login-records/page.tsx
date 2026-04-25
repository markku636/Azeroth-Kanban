'use client';

import { useCallback, useEffect, useState } from 'react';
import { PiShieldWarningDuotone, PiCircleFill } from 'react-icons/pi';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/use-translation';

interface LoginRecord {
  id: string;
  email: string;
  provider: string;
  status: string;
  failureReason: string | null;
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

const PROVIDER_LABELS: Record<string, string> = {
  credentials: '帳號密碼',
};

const FAILURE_REASON_LABELS: Record<string, string> = {
  invalid_credentials: '密碼錯誤',
  inactive_account: '帳號已封鎖',
};

export default function LoginRecordsPage() {
  const { t } = useTranslation();

  const [records, setRecords] = useState<LoginRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false,
  });
  const [loading, setLoading] = useState(true);

  // ── Filters ──
  const today = new Date().toISOString().slice(0, 10);
  const [emailFilter, setEmailFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const fetchRecords = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (emailFilter) params.set('email', emailFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/v1/admin/login-records?${params}`);
      const json = await res.json();
      if (json.success) {
        setRecords(json.data.items);
        setPagination(json.data.pagination);
      } else {
        toast.error(json.message || t('admin.loginRecords.loadFailed'));
      }
    } catch {
      toast.error(t('admin.loginRecords.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [emailFilter, statusFilter, startDate, endDate, t]);

  useEffect(() => { fetchRecords(1); }, [fetchRecords]);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('zh-TW', { hour12: false });

  return (
    <div className="p-6">
      <div className="max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <PiShieldWarningDuotone className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('admin.loginRecords.title')}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {t('admin.loginRecords.description')}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            placeholder={t('admin.loginRecords.emailPlaceholder')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary w-56"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t('common.status')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{t('common.all')}</option>
            <option value="success">{t('admin.loginRecords.statusSuccess')}</option>
            <option value="failed">{t('admin.loginRecords.statusFailed')}</option>
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label={t('admin.loginRecords.startDate')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="text-gray-400 text-sm">～</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label={t('admin.loginRecords.endDate')}
            className="rounded-lg border border-gray-300 bg-gray-0 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-lg bg-gray-0 shadow border border-gray-200 p-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
            <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-lg bg-gray-0 shadow border border-gray-200 p-8 text-center">
            <PiShieldWarningDuotone className="mx-auto w-12 h-12 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">{t('admin.loginRecords.empty')}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-gray-0 shadow border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      t('common.email'),
                      t('admin.loginRecords.provider'),
                      t('common.status'),
                      t('admin.loginRecords.failureReason'),
                      t('admin.loginRecords.ipAddress'),
                      t('admin.loginRecords.loginTime'),
                    ].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {record.email}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                          {PROVIDER_LABELS[record.provider] ?? record.provider}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          record.status === 'success'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          <PiCircleFill className="w-2 h-2" />
                          {record.status === 'success' ? t('admin.loginRecords.statusSuccess') : t('admin.loginRecords.statusFailed')}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                        {record.failureReason
                          ? (FAILURE_REASON_LABELS[record.failureReason] ?? record.failureReason)
                          : '—'}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-500">
                        {record.ipAddress ?? '—'}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(record.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  共 {pagination.totalItems} 筆，第 {pagination.page} / {pagination.totalPages} 頁
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchRecords(pagination.page - 1)}
                    disabled={!pagination.hasPrevPage}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('common.prevPage')}
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchRecords(pagination.page + 1)}
                    disabled={!pagination.hasNextPage}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
