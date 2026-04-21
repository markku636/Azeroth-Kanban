'use client';

import { useSyncExternalStore, useCallback } from 'react';
import {
  type Locale,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from '@/config/i18n';
import zhTW from '@/locales/zh-TW.json';
import en from '@/locales/en.json';

// ── Static dictionaries (bundled at build time) ──
const dictionaries: Record<Locale, Record<string, unknown>> = {
  'zh-TW': zhTW,
  en,
};

// ── Module-level locale store ──
let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function initLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  return DEFAULT_LOCALE;
}

// Initialize once on module load (client only)
if (typeof window !== 'undefined') {
  currentLocale = initLocale();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Locale {
  return currentLocale;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function changeLocale(locale: Locale) {
  if (locale === currentLocale) return;
  currentLocale = locale;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  listeners.forEach((cb) => cb());
}

// ── Deep key resolver ──
function resolve(dict: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.');
  let node: unknown = dict;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

// ── Interpolation: replaces {{var}} placeholders ──
function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    params[key] != null ? String(params[key]) : `{{${key}}}`
  );
}

// ── Hook ──
export function useTranslation() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = dictionaries[locale];
      const value = resolve(dict, key);
      if (value != null) return interpolate(value, params);

      // Fallback to zh-TW if current locale is different
      if (locale !== 'zh-TW') {
        const fallback = resolve(dictionaries['zh-TW'], key);
        if (fallback != null) return interpolate(fallback, params);
      }

      // Last resort: return the key itself
      return key;
    },
    [locale]
  );

  const setLocale = useCallback((loc: Locale) => {
    changeLocale(loc);
  }, []);

  return { t, locale, setLocale } as const;
}
