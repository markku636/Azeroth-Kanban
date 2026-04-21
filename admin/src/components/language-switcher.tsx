'use client';

import { useTranslation } from '@/hooks/use-translation';
import type { Locale } from '@/config/i18n';

const toggleMap: Record<Locale, Locale> = {
  'zh-TW': 'en',
  en: 'zh-TW',
};

const labelMap: Record<Locale, string> = {
  'zh-TW': 'EN',
  en: '中',
};

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => setLocale(toggleMap[locale])}
      className={
        className ??
        'flex h-[34px] w-[34px] items-center justify-center rounded-full text-xs font-semibold shadow backdrop-blur-md transition-colors hover:bg-gray-100 md:h-9 md:w-9 dark:bg-gray-100 dark:hover:bg-gray-200'
      }
      title={locale === 'zh-TW' ? 'Switch to English' : '切換至中文'}
    >
      {labelMap[locale]}
    </button>
  );
}
