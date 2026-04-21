// ─── 支援語系 ───
export const SUPPORTED_LOCALES = ['zh-TW', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'zh-TW';

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'zh-TW': '中文',
  en: 'English',
};

export const ROW_PER_PAGE_OPTIONS = [
  {
    value: 5,
    name: '5',
  },
  {
    value: 10,
    name: '10',
  },
  {
    value: 15,
    name: '15',
  },
  {
    value: 20,
    name: '20',
  },
];
