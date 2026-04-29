'use client';

import { ReactNode, useState } from 'react';
import { cn } from '@/utils/class-names';
import Pagination from '@/components/pagination';
import { useTranslation } from '@/hooks/use-translation';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (item: T, index: number) => ReactNode;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  // Pagination props
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  // Actions
  onRowClick?: (item: T) => void;
  // Selection
  selectable?: boolean;
  selectedKeys?: Set<string | number>;
  onSelectionChange?: (selectedKeys: Set<string | number>) => void;
  // Styling
  className?: string;
  headerClassName?: string;
  rowClassName?: string | ((item: T, index: number) => string);
  // Search
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
}

export default function DataTable<T>({
  data,
  columns,
  keyExtractor,
  loading = false,
  emptyMessage,
  pagination,
  onRowClick,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  className,
  headerClassName,
  rowClassName,
  searchPlaceholder,
  onSearch,
  searchValue,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t('common.noData');
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('common.searchPlaceholder');
  const [localSearchValue, setLocalSearchValue] = useState(searchValue || '');

  const handleSearch = () => {
    if (onSearch) {
      onSearch(localSearchValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setLocalSearchValue('');
    if (onSearch) {
      onSearch('');
    }
  };

  // Selection helpers
  const allKeys = data.map((item) => keyExtractor(item));
  const isAllSelected = selectable && allKeys.length > 0 && allKeys.every((k) => selectedKeys?.has(k));
  const isSomeSelected = selectable && allKeys.some((k) => selectedKeys?.has(k));

  const toggleAll = () => {
    if (!onSelectionChange) {return;}
    if (isAllSelected) {
      // Deselect all current page items
      const next = new Set(selectedKeys);
      allKeys.forEach((k) => next.delete(k));
      onSelectionChange(next);
    } else {
      // Select all current page items
      const next = new Set(selectedKeys);
      allKeys.forEach((k) => next.add(k));
      onSelectionChange(next);
    }
  };

  const toggleOne = (key: string | number) => {
    if (!onSelectionChange) {return;}
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  const getAlignClass = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  const getRowClassName = (item: T, index: number) => {
    if (typeof rowClassName === 'function') {
      return rowClassName(item, index);
    }
    return rowClassName || '';
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg bg-gray-0 dark:bg-gray-100 shadow border border-gray-200',
        className
      )}
    >
      {/* Search Bar */}
      {onSearch && (
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={localSearchValue}
                onChange={(e) => setLocalSearchValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={resolvedSearchPlaceholder}
                className="w-full rounded-lg border border-gray-300 bg-gray-0 dark:bg-gray-100 px-4 py-2 pr-10 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {localSearchValue && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300 transition-colors"
            >
              {t('common.search')}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className={cn('bg-gray-100', headerClassName)}>
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-3" aria-label={t('common.selectAll')}>
                  <input
                    type="checkbox"
                    title={t('common.selectAll')}
                    checked={isAllSelected}
                    ref={(el) => { if (el) {el.indeterminate = !isAllSelected && isSomeSelected;} }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-600',
                    getAlignClass(column.align)
                  )}
                  style={{ width: column.width }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                    <span>{t('common.loading')}</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  {resolvedEmptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, index) => {
                const itemKey = keyExtractor(item);
                return (
                  <tr
                    key={itemKey}
                    onClick={() => onRowClick?.(item)}
                    className={cn(
                      'bg-gray-0 dark:bg-gray-100 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-gray-50',
                      selectable && selectedKeys?.has(itemKey) && 'bg-blue-50 dark:bg-blue-900/20',
                      getRowClassName(item, index)
                    )}
                  >
                    {selectable && (
                      <td className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          title={t('common.select')}
                          checked={selectedKeys?.has(itemKey) ?? false}
                          onChange={() => toggleOne(itemKey)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'whitespace-nowrap px-4 py-3 text-sm text-gray-900',
                          getAlignClass(column.align)
                        )}
                      >
                        {column.render
                          ? column.render(item, index)
                          : (item as Record<string, unknown>)[column.key] as ReactNode}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalItems > 0 && (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
          hasNextPage={pagination.hasNextPage}
          hasPrevPage={pagination.hasPrevPage}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}
    </div>
  );
}
