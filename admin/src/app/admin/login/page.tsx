"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Title, Text } from "rizzui";
import { useTranslation } from "@/hooks/use-translation";
import LanguageSwitcher from "@/components/language-switcher";

const QUICK_FILL_PRESETS = [
  {
    role: "Admin",
    username: "admin@example.com",
    password: "Admin@1234",
    btnClass:
      "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50",
  },
  {
    role: "User",
    username: "user@example.com",
    password: "User@1234",
    btnClass:
      "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50",
  },
  {
    role: "Viewer",
    username: "viewer@example.com",
    password: "Viewer@1234",
    btnClass:
      "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50",
  },
] as const;

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [credLoading, setCredLoading] = useState(false);

  const fillCredentials = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError("");
  };

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t("login.errorEmpty"));
      return;
    }
    setError("");
    setCredLoading(true);
    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password: password.trim(),
        redirect: false,
        callbackUrl: "/admin",
      });
      if (result?.error) {
        setError(t("login.errorInvalid"));
      } else if (result?.ok) {
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError(t("login.errorGeneral"));
    } finally {
      setCredLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-200 dark:bg-gray-100">
          <div className="relative mb-6 text-center">
            <div className="absolute right-0 top-0">
              <LanguageSwitcher />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={t("login.title")} className="mx-auto mb-3 h-28 w-auto" />
            <Title as="h1" className="text-xl font-bold text-gray-900">
              {t("login.title")}
            </Title>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs text-gray-500">
              {t("login.quickFillTitle")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_FILL_PRESETS.map((preset) => (
                <button
                  key={preset.role}
                  type="button"
                  onClick={() => fillCredentials(preset.username, preset.password)}
                  disabled={credLoading}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${preset.btnClass}`}
                >
                  {preset.role}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
              <Text className="text-sm text-red-700 dark:text-red-300">{error}</Text>
            </div>
          )}

          <form onSubmit={handleCredentialsLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-600">
                {t("login.username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("login.usernamePlaceholder")}
                autoComplete="username"
                disabled={credLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 dark:border-gray-300 dark:bg-gray-200 dark:text-white dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-600">
                {t("login.password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                autoComplete="current-password"
                disabled={credLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 dark:border-gray-300 dark:bg-gray-200 dark:text-white dark:placeholder-gray-500"
              />
            </div>
            <button
              type="submit"
              disabled={credLoading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {credLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t("login.loggingIn")}
                </span>
              ) : (
                t("login.submit")
              )}
            </button>
          </form>
        </div>

        <Text className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} {t("login.copyright")}
        </Text>
      </div>
    </div>
  );
}
