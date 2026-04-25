'use client';

import { cn } from '@/utils/class-names';
import { useTranslation } from '@/hooks/use-translation';

export type StatusType =
  | 'active'
  | 'inactive'
  | 'cancelled'
  | 'deleted'
  | 'pending'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'enterprise'
  | 'trial'
  | 'paid'
  | 'free';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<StatusType, { bg: string; text: string }> = {
  active: {
    bg: 'bg-green-100 dark:bg-green-900/50',
    text: 'text-green-800 dark:text-green-300',
  },
  inactive: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
  },
  cancelled: {
    bg: 'bg-orange-100 dark:bg-orange-900/50',
    text: 'text-orange-800 dark:text-orange-300',
  },
  deleted: {
    bg: 'bg-red-100 dark:bg-red-900/50',
    text: 'text-red-800 dark:text-red-300',
  },
  pending: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/50',
    text: 'text-yellow-800 dark:text-yellow-300',
  },
  success: {
    bg: 'bg-green-100 dark:bg-green-900/50',
    text: 'text-green-800 dark:text-green-300',
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-900/50',
    text: 'text-red-800 dark:text-red-300',
  },
  warning: {
    bg: 'bg-amber-100 dark:bg-amber-900/50',
    text: 'text-amber-800 dark:text-amber-300',
  },
  info: {
    bg: 'bg-blue-100 dark:bg-blue-900/50',
    text: 'text-blue-800 dark:text-blue-300',
  },
  enterprise: {
    bg: 'bg-purple-100 dark:bg-purple-900/50',
    text: 'text-purple-800 dark:text-purple-300',
  },
  trial: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/50',
    text: 'text-cyan-800 dark:text-cyan-300',
  },
  paid: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/50',
    text: 'text-emerald-800 dark:text-emerald-300',
  },
  free: {
    bg: 'bg-slate-100 dark:bg-slate-700',
    text: 'text-slate-800 dark:text-slate-300',
  },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

export default function StatusBadge({
  status,
  label,
  className,
  size = 'md',
}: StatusBadgeProps) {
  const { t } = useTranslation();
  const config = statusConfig[status];

  const statusLabels: Record<StatusType, string> = {
    active: t('status.active'),
    inactive: t('status.inactive'),
    cancelled: t('status.cancelled'),
    deleted: t('status.deleted'),
    pending: t('status.pending'),
    success: t('status.success'),
    error: t('status.error'),
    warning: t('status.warning'),
    info: t('status.info'),
    enterprise: t('status.enterprise'),
    trial: t('status.trial'),
    paid: t('status.paid'),
    free: t('status.free'),
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        config.bg,
        config.text,
        sizeClasses[size],
        className
      )}
    >
      {label || statusLabels[status]}
    </span>
  );
}

