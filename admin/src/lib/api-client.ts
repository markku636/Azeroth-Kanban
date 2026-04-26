'use client';

import { signOut } from 'next-auth/react';
import toast from 'react-hot-toast';
import { ApiReturnCode, type ApiResult } from '@azeroth/common';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale, SUPPORTED_LOCALES } from '@/config/i18n';
import { routes } from '@/config/routes';
import zhTW from '@/locales/zh-TW.json';
import en from '@/locales/en.json';

interface ApiFetchOptions extends RequestInit {
  /** 設為 true 時不攔截 401（例如登入頁本身） */
  skipAuthRedirect?: boolean;
}

const SESSION_EXPIRED_REDIRECT_DELAY_MS = 1200;

const sessionExpiredMessages: Record<Locale, string> = {
  'zh-TW': zhTW.common.sessionExpired,
  en: en.common.sessionExpired,
};

let isHandlingSessionExpired = false;

function resolveLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  return DEFAULT_LOCALE;
}

function handleSessionExpired(): void {
  if (isHandlingSessionExpired) return;
  isHandlingSessionExpired = true;

  const message = sessionExpiredMessages[resolveLocale()];
  toast.error(message);

  setTimeout(() => {
    signOut({ callbackUrl: routes.login });
  }, SESSION_EXPIRED_REDIRECT_DELAY_MS);
}

export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: ApiFetchOptions,
): Promise<ApiResult<T>> {
  const { skipAuthRedirect, ...fetchInit } = init ?? {};
  const res = await fetch(input, fetchInit);
  const json = (await res.json()) as ApiResult<T>;

  if (!skipAuthRedirect && (res.status === 401 || json.code === ApiReturnCode.UNAUTHORIZED)) {
    handleSessionExpired();
  }

  return json;
}
