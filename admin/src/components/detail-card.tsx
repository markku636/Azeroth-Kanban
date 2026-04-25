'use client';

import { cn } from '@/utils/class-names';
import { ReactNode } from 'react';

interface DetailCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export default function DetailCard({
  title,
  children,
  className,
  action,
}: DetailCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-gray-0 dark:bg-gray-100 shadow border border-gray-200',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-base font-semibold text-gray-900">
          {title}
        </h3>
        {action && <div>{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// Detail Item component for displaying label-value pairs
interface DetailItemProps {
  label: string;
  value: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function DetailItem({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: DetailItemProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <dt
        className={cn(
          'text-sm text-gray-500',
          labelClassName
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'text-sm font-medium text-gray-900',
          valueClassName
        )}
      >
        {value || '-'}
      </dd>
    </div>
  );
}

// Detail Grid for displaying multiple items in a grid layout
interface DetailGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export function DetailGrid({
  children,
  columns = 2,
  className,
}: DetailGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <dl className={cn('grid gap-4', gridCols[columns], className)}>
      {children}
    </dl>
  );
}
