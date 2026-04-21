'use client';

import Link from 'next/link';
import { routes } from '@/config/routes';
import {
  PiUserGearDuotone,
  PiShieldCheckDuotone,
  PiClipboardTextDuotone,
  PiShieldWarningDuotone,
} from 'react-icons/pi';

export default function DashboardPage() {
  const quickLinks = [
    {
      title: '角色管理',
      description: '建立、編輯、刪除系統角色，設定角色可用權限',
      href: routes.roles.list,
      icon: <PiShieldCheckDuotone className="w-8 h-8" />,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/50',
    },
    {
      title: '使用者角色',
      description: '指派使用者對應的系統角色',
      href: routes.userRoles.list,
      icon: <PiUserGearDuotone className="w-8 h-8" />,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/50',
    },
    {
      title: '稽核紀錄',
      description: '檢視後台操作異動紀錄',
      href: routes.auditLogs,
      icon: <PiClipboardTextDuotone className="w-8 h-8" />,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/50',
    },
    {
      title: '登入紀錄',
      description: '檢視使用者登入歷史與失敗事件',
      href: routes.loginRecords,
      icon: <PiShieldWarningDuotone className="w-8 h-8" />,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/50',
    },
  ];

  return (
    <div className="p-6">
      <div className="max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            管理首頁
          </h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Azeroth Kanban 管理後台
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            快速入口
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg bg-white dark:bg-gray-800 p-6 shadow border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
              >
                <div className={`inline-flex p-3 rounded-lg ${link.bgColor} mb-4`}>
                  <span className={link.color}>{link.icon}</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {link.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
