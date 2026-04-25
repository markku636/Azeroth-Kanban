'use client';

import { ReactNode } from 'react';
import { cn } from '@/utils/class-names';

// ========================================
// FormSection - 表單區段
// ========================================

interface FormSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, children, className }: FormSectionProps) {
  return (
    <div className={cn('border-b border-gray-200 pb-6 last:border-b-0', className)}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ========================================
// FormField - 表單欄位
// ========================================

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, required, hint, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('', className)}>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

// ========================================
// FormRow - 表單列（多欄位並排）
// ========================================

interface FormRowProps {
  children: ReactNode;
  columns?: 2 | 3;
  className?: string;
}

export function FormRow({ children, columns = 2, className }: FormRowProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
}

// ========================================
// FormInput - 表單輸入元件
// ========================================

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function FormInput({ error, className, ...props }: FormInputProps) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
        'bg-gray-0 text-gray-900 placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-blue-500',
        error
          ? 'border-red-500'
          : 'border-gray-300',
        props.disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    />
  );
}

// ========================================
// FormSelect - 表單選擇元件
// ========================================

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { label: string; value: string | number }[];
  error?: boolean;
}

export function FormSelect({ options, error, className, ...props }: FormSelectProps) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
        'bg-gray-0 text-gray-900',
        'focus:outline-none focus:ring-2 focus:ring-blue-500',
        error
          ? 'border-red-500'
          : 'border-gray-300',
        props.disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ========================================
// FormCheckbox - 表單核取方塊
// ========================================

interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function FormCheckbox({ label, checked, onChange, disabled }: FormCheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

// ========================================
// InputWithUnit - 帶單位的輸入元件
// ========================================

interface InputWithUnitProps extends React.InputHTMLAttributes<HTMLInputElement> {
  unit: string;
  error?: boolean;
}

export function InputWithUnit({ unit, error, className, ...props }: InputWithUnitProps) {
  return (
    <div className="flex items-center gap-2">
      <FormInput error={error} className={className} {...props} />
      <span className="whitespace-nowrap text-sm text-gray-500">
        {unit}
      </span>
    </div>
  );
}

// ========================================
// FormCard - 表單卡片容器
// ========================================

interface FormCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;
  loading?: boolean;
  className?: string;
}

export default function FormCard({
  title,
  description,
  children,
  onSubmit,
  submitLabel = '送出',
  loading = false,
  className,
}: FormCardProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-gray-0 shadow-sm',
        className
      )}
    >
      {/* 標題區 */}
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>

      {/* 表單區 */}
      <form onSubmit={handleSubmit}>
        <div className="space-y-6 px-6 py-5">{children}</div>

        {/* 送出按鈕（僅在有 onSubmit 且有 submitLabel 時顯示） */}
        {onSubmit && submitLabel && (
          <div className="border-t border-gray-200 px-6 py-4">
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors',
                'bg-blue-600 hover:bg-blue-700',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {loading ? '處理中...' : submitLabel}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
