'use client';

import { cn } from '@/utils/class-names';

// ========================================
// StatusAlert - 狀態訊息
// ========================================

type StatusType = 'info' | 'success' | 'error' | 'warning';

interface StatusAlertProps {
  message: string;
  type: StatusType;
  visible: boolean;
  className?: string;
}

const statusStyles: Record<StatusType, string> = {
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  success:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  error:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  warning:
    'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
};

export function StatusAlert({ message, type, visible, className }: StatusAlertProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        statusStyles[type],
        className
      )}
    >
      {message}
    </div>
  );
}

// ========================================
// ApiResultPanel - API 結果面板
// ========================================

interface ApiResultPanelProps {
  visible: boolean;
  title: string;
  isSuccess: boolean;
  details?: unknown;
  className?: string;
}

export default function ApiResultPanel({
  visible,
  title,
  isSuccess,
  details,
  className,
}: ApiResultPanelProps) {
  if (!visible) return null;

  const formattedDetails =
    typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details || '');

  return (
    <div
      className={cn(
        'mt-4 rounded-lg border bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/50',
        className
      )}
    >
      {/* 結果標題 */}
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        API 回應結果
      </div>

      {/* 結果狀態 */}
      <div
        className={cn(
          'text-lg font-bold',
          isSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        )}
      >
        {title}
      </div>

      {/* 詳細內容 */}
      {formattedDetails && (
        <pre
          className={cn(
            'mt-3 max-h-64 overflow-auto rounded-lg border p-3',
            'bg-white text-xs text-gray-800',
            'dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300',
            'font-mono leading-relaxed'
          )}
        >
          {formattedDetails}
        </pre>
      )}
    </div>
  );
}
