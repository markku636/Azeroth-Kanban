"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Title, Text } from "rizzui";
import { useTranslation } from "@/hooks/use-translation";
import LanguageSwitcher from "@/components/language-switcher";

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('login.errorEmpty'));
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password: password.trim(),
        redirect: false,
        callbackUrl: "/admin",
      });
      if (result?.error) {
        setError(t('login.errorInvalid'));
      } else if (result?.ok) {
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError(t('login.errorGeneral'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-900 dark:to-gray-950">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-200 dark:bg-gray-100">
          <div className="relative mb-6 text-center">
            <div className="absolute right-0 top-0"><LanguageSwitcher /></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={t('login.title')} className="mx-auto mb-3 h-28 w-auto" />
            <Title as="h1" className="text-xl font-bold text-gray-900 dark:text-white">
              {t('login.title')}
            </Title>
            <Text className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('login.adminSubtitle')}
            </Text>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
              <Text className="text-sm text-red-700 dark:text-red-300">{error}</Text>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-600">
                {t('login.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('login.usernamePlaceholder')}
                autoComplete="username"
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 dark:border-gray-300 dark:bg-gray-200 dark:text-white dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-600">
                {t('login.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 dark:border-gray-300 dark:bg-gray-200 dark:text-white dark:placeholder-gray-500"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t('login.loggingIn')}
                </span>
              ) : (
                t('login.submit')
              )}
            </button>
          </form>
        </div>

        <Text className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Azeroth Kanban
        </Text>
      </div>
    </div>
  );
}
