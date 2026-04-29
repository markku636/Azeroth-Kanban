import Link from "next/link";
import { routes } from "@/config/routes";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-200 dark:bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Azeroth Kanban"
            className="mx-auto mb-6 h-20 w-auto opacity-90"
          />

          <p className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent">
            404
          </p>

          <h1 className="mt-4 text-xl font-bold text-gray-900">
            找不到這個頁面
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            這個網址可能已搬家或從未存在。
            <br />
            回首頁繼續操作吧。
          </p>

          <Link
            href={routes.dashboard}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            回首頁
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Azeroth Kanban
        </p>
      </div>
    </div>
  );
}
