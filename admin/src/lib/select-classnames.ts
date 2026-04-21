import type { ClassNamesConfig, GroupBase } from 'react-select';

// Shared react-select classNames config for all drawers/forms.
// Uses `unstyled + classNames` approach so Tailwind dark: prefix works automatically
// (project uses `[data-theme="dark"]` selector on <html>).
// Pass `menuPortalTarget={document.body}` on the component to avoid overflow-y clipping.

export const selectClassNames: ClassNamesConfig<any, any, GroupBase<any>> = {
  control: ({ isFocused, isDisabled }) =>
    [
      'rounded-lg border transition-colors min-h-[38px]',
      isDisabled
        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-60 cursor-not-allowed'
        : isFocused
          ? 'border-blue-500 ring-2 ring-blue-500 bg-white dark:bg-gray-700'
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700',
    ].join(' '),
  menu: () =>
    'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden mt-1',
  menuPortal: () => 'z-[10000]',
  option: ({ isSelected, isFocused }) =>
    [
      'px-3 py-2 text-sm cursor-pointer',
      isSelected
        ? 'bg-blue-600 text-white'
        : isFocused
          ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
          : 'text-gray-900 dark:text-white',
    ].join(' '),
  placeholder: () => 'text-gray-400 dark:text-gray-500 text-sm',
  singleValue: () => 'text-gray-900 dark:text-white text-sm',
  multiValue: () => 'bg-blue-100 dark:bg-blue-900/40 rounded',
  multiValueLabel: () => 'text-blue-800 dark:text-blue-300 text-xs px-1.5 py-0.5',
  multiValueRemove: () =>
    'text-blue-500 dark:text-blue-400 hover:text-red-500 hover:bg-transparent px-1 rounded-r',
  input: () => 'text-gray-900 dark:text-white text-sm',
  valueContainer: () => 'px-2 py-1 gap-1',
  indicatorsContainer: () => 'px-1',
  clearIndicator: () =>
    'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer p-1',
  dropdownIndicator: () =>
    'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer p-1',
  indicatorSeparator: () => 'bg-gray-200 dark:bg-gray-600 my-2',
  noOptionsMessage: () =>
    'text-sm text-gray-400 dark:text-gray-500 px-4 py-3 text-center',
  loadingMessage: () =>
    'text-sm text-gray-400 dark:text-gray-500 px-4 py-3 text-center',
};
