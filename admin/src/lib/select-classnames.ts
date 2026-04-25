import type { ClassNamesConfig, GroupBase } from 'react-select';

// Shared react-select classNames config for all drawers/forms.
// Project's gray scale auto-inverts in dark mode (see globals.css), so a single
// `gray-N` token gives the right colour in both themes — do NOT pair with `dark:gray-*`.
// Pass `menuPortalTarget={document.body}` on the component to avoid overflow-y clipping.

export const selectClassNames: ClassNamesConfig<any, any, GroupBase<any>> = {
  control: ({ isFocused, isDisabled }) =>
    [
      'rounded-lg border transition-colors min-h-[38px]',
      isDisabled
        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
        : isFocused
          ? 'border-blue-500 ring-2 ring-blue-500 bg-gray-0 dark:bg-gray-100'
          : 'border-gray-300 bg-gray-0 dark:bg-gray-100',
    ].join(' '),
  menu: () =>
    'rounded-lg border border-gray-200 bg-gray-0 dark:bg-gray-100 shadow-lg overflow-hidden mt-1',
  menuPortal: () => 'z-[10000]',
  option: ({ isSelected, isFocused }) =>
    [
      'px-3 py-2 text-sm cursor-pointer',
      isSelected
        ? 'bg-blue-600 text-white'
        : isFocused
          ? 'bg-gray-100 text-gray-900'
          : 'text-gray-900',
    ].join(' '),
  placeholder: () => 'text-gray-400 text-sm',
  singleValue: () => 'text-gray-900 text-sm',
  multiValue: () => 'bg-blue-100 dark:bg-blue-900/40 rounded',
  multiValueLabel: () => 'text-blue-800 dark:text-blue-300 text-xs px-1.5 py-0.5',
  multiValueRemove: () =>
    'text-blue-500 dark:text-blue-400 hover:text-red-500 hover:bg-transparent px-1 rounded-r',
  input: () => 'text-gray-900 text-sm',
  valueContainer: () => 'px-2 py-1 gap-1',
  indicatorsContainer: () => 'px-1',
  clearIndicator: () =>
    'text-gray-400 hover:text-gray-600 cursor-pointer p-1',
  dropdownIndicator: () =>
    'text-gray-400 hover:text-gray-600 cursor-pointer p-1',
  indicatorSeparator: () => 'bg-gray-200 my-2',
  noOptionsMessage: () =>
    'text-sm text-gray-400 px-4 py-3 text-center',
  loadingMessage: () =>
    'text-sm text-gray-400 px-4 py-3 text-center',
};
