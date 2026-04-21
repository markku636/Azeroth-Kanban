'use client';

import { useState, useEffect, ReactNode } from 'react';
import { Modal } from '@/components/modal';
import { cn } from '@/utils/class-names';

export interface EditField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'datetime-local';
  value: string | number | boolean;
  options?: { label: string; value: string | number }[];
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  description?: string;
}

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string | number | boolean>) => Promise<void>;
  title: string;
  fields: EditField[];
  loading?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
}

export default function EditModal({
  isOpen,
  onClose,
  onSave,
  title,
  fields,
  loading = false,
  saveLabel = '儲存',
  cancelLabel = '取消',
}: EditModalProps) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Initialize values when modal opens or fields change
  useEffect(() => {
    const initialValues: Record<string, string | number | boolean> = {};
    fields.forEach((field) => {
      initialValues[field.name] = field.value;
    });
    setValues(initialValues);
    setErrors({});
  }, [fields, isOpen]);

  const handleChange = (name: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear error when field is edited
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && !values[field.name] && values[field.name] !== 0) {
        newErrors[field.name] = `${field.label} 為必填欄位`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onSave(values);
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field: EditField): ReactNode => {
    const value = values[field.name];
    const error = errors[field.name];
    const baseInputClass = cn(
      'w-full rounded-lg border px-3 py-2 text-sm',
      'bg-white dark:bg-gray-700',
      'text-gray-900 dark:text-white',
      'placeholder-gray-500 dark:placeholder-gray-400',
      'focus:outline-none focus:ring-2 focus:ring-blue-500',
      error
        ? 'border-red-500 dark:border-red-500'
        : 'border-gray-300 dark:border-gray-600',
      field.disabled && 'opacity-50 cursor-not-allowed'
    );

    switch (field.type) {
      case 'select':
        return (
          <select
            value={String(value)}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={field.disabled}
            className={baseInputClass}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleChange(field.name, e.target.checked)}
              disabled={field.disabled}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {field.placeholder || '啟用'}
            </span>
          </label>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value as number}
            onChange={(e) => handleChange(field.name, Number(e.target.value))}
            disabled={field.disabled}
            placeholder={field.placeholder}
            className={baseInputClass}
          />
        );

      case 'date':
      case 'datetime-local':
        return (
          <input
            type={field.type}
            value={value as string}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={field.disabled}
            className={baseInputClass}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value as string}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={field.disabled}
            placeholder={field.placeholder}
            className={baseInputClass}
          />
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {renderField(field)}
              {field.description && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {field.description}
                </p>
              )}
              {errors[field.name] && (
                <p className="mt-1 text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isSaving || loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSaving || loading ? '儲存中...' : saveLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
