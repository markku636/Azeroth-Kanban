'use client';

import { useTranslation } from '@/hooks/use-translation';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  hasNextPage,
  hasPrevPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const { t } = useTranslation();
  // 計算顯示的頁碼範圍
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      // 總頁數較少，全部顯示
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 總頁數較多，顯示部分頁碼
      if (page <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = page - 1; i <= page + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-gray-0 dark:bg-gray-100 border-t border-gray-200">
      {/* 左側：顯示資訊和每頁筆數選擇 */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span>
          {t('common.showing', { start: String(startItem), end: String(endItem), total: totalItems.toLocaleString() })}
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="pageSize">{t('common.perPage')}</label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="min-w-[70px] rounded border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>{t('common.items')}</span>
        </div>
      </div>

      {/* 右側：分頁按鈕 */}
      <div className="flex items-center gap-1">
        {/* 上一頁 */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevPage}
          className="flex items-center justify-center w-8 h-8 rounded border border-gray-300 bg-gray-0 dark:bg-gray-100 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('common.prevPage')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 頁碼按鈕 */}
        {getPageNumbers().map((pageNum, index) =>
          pageNum === '...' ? (
            <span
              key={`ellipsis-${index}`}
              className="flex items-center justify-center w-8 h-8 text-gray-500"
            >
              ...
            </span>
          ) : (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum as number)}
              className={`flex items-center justify-center w-8 h-8 rounded border text-sm font-medium transition-colors ${
                page === pageNum
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-gray-300 bg-gray-0 dark:bg-gray-100 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {pageNum}
            </button>
          )
        )}

        {/* 下一頁 */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          className="flex items-center justify-center w-8 h-8 rounded border border-gray-300 bg-gray-0 dark:bg-gray-100 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('common.nextPage')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
