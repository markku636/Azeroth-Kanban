/**
 * Next.js instrumentation —— admin server 啟動時觸發一次。
 *
 * 在 nodejs runtime 啟動「主動監控引擎」(`admin/src/lib/monitor-engine.ts`)。
 * 引擎內部自帶 globalThis-keyed 單例守衛,因此 dev hot-reload / 重複 register
 * 不會疊出多個 setInterval。
 *
 * 可用環境變數:
 *   MONITOR_ENGINE_ENABLED=false  完全停用監控引擎(預設啟用)
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.MONITOR_ENGINE_ENABLED === 'false') {
    console.log('[instrumentation] monitor engine disabled by MONITOR_ENGINE_ENABLED=false');
    return;
  }
  const { startMonitorEngine } = await import('./lib/monitor-engine');
  startMonitorEngine();
  console.log('[instrumentation] Selkie monitor engine registered');
}
