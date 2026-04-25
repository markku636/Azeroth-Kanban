'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/use-translation';

interface MeData {
  id: string;
  email: string;
  name: string;
  role: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function MePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/me');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.message || '載入失敗');
      }
    } catch {
      toast.error('載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="ml-3 text-gray-500">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-gray-0 shadow border border-gray-200 p-8 text-center">
          <p className="text-gray-500">載入失敗</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">個人資料</h1>
          <p className="mt-1 text-sm text-gray-500">目前登入者的基本資料</p>
        </div>

        <div className="rounded-lg bg-gray-0 shadow border border-gray-200 p-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">姓名</dt>
              <dd className="mt-1 font-medium text-gray-900">{data.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="mt-1 font-medium text-gray-900">{data.email}</dd>
            </div>
            <div>
              <dt className="text-gray-500">角色</dt>
              <dd className="mt-1 font-medium text-gray-900">{data.role ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">狀態</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {data.isActive ? '啟用' : '停用'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">建立時間</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {new Date(data.createdAt).toLocaleString('zh-TW')}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
