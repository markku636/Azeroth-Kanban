/**
 * 主動監控引擎 —— 內嵌在 admin Next.js 容器內常駐的排程器。
 *
 * 由 `admin/src/instrumentation.ts` 的 `register()` 啟動。每 ENGINE_TICK_MS 一個 tick:
 *  1. 載入啟用中、到期的 Monitor;序列(非並行)逐一檢查。
 *  2. 過維護視窗 / 活躍時段 / 父相依抑制三道閘。
 *  3. 依 Monitor.kind 跑 HTTP / TCP / KEYWORD / PUSH / LOG 檢查(全部包 AbortController 逾時)。
 *  4. 寫 MonitorCheck + 修剪歷史。
 *  5. 套狀態機:連續失敗達門檻 → 跨 monitor 同 service 已開事故就附掛、否則 createIncident →
 *     judgeSeverity(支援 severityRamp 多級嚴重度)→ notifyChannels → (可選) startTriage。
 *  6. 服務恢復(從 DOWN → OK):自動把 source=monitor 的事故 status 設為 RESOLVED + recovery 通知。
 *  7. 已 DOWN + reAlertMinutes 到 → 再次 notify(節流)。
 *
 * 守衛:globalThis-keyed 單例(dev hot-reload 不疊出多個 interval)+ 模組級重入鎖(tick 重疊跳過)。
 */
import net from 'node:net';

import type { IncidentSeverity, Monitor, MonitorChannel, MonitorCheckResult, NotificationChannel } from '@prisma/client';

import { findDefaultOwner } from '@/lib/alert-webhook-service';
import { createIncident, type IncidentActor } from '@/lib/incident-service';
import { notifyChannels, type NotifyResult } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { startTriage } from '@/lib/selkie-service';

const ENGINE_TICK_MS = 15_000;
const ES_QUERY_TIMEOUT_MS = 10_000;
const CHECK_RETENTION = 500;
const ELASTICSEARCH_URL = (process.env.ELASTICSEARCH_URL ?? 'http://elasticsearch:9200').replace(/\/+$/, '');

type MonitorWithChannels = Monitor & {
  channelLinks: Array<MonitorChannel & { channel: NotificationChannel }>;
};

interface CheckResult {
  result: 'OK' | 'FAIL' | 'SKIPPED';
  magnitude?: number | null;
  latencyMs?: number | null;
  detail?: string | null;
}

// ── globalThis 守衛 + 重入鎖 ────────────────────────────────────────────────
const g = globalThis as unknown as { __selkieMonitorEngine?: { timer: NodeJS.Timeout } };
let tickRunning = false;

/** 啟動引擎(idempotent;dev hot-reload 重複呼叫不會疊出多個 interval)。 */
export function startMonitorEngine(): void {
  if (g.__selkieMonitorEngine) return;
  const timer = setInterval(() => {
    void safeTick();
  }, ENGINE_TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  g.__selkieMonitorEngine = { timer };
  console.log('[MonitorEngine] started (tick interval %dms)', ENGINE_TICK_MS);
}

async function safeTick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await tick();
  } catch (e) {
    console.error('[MonitorEngine] tick error:', e);
  } finally {
    tickRunning = false;
  }
}

async function tick(): Promise<void> {
  const now = Date.now();
  const enabled = await prisma.monitor.findMany({
    where: { enabled: true },
    include: { channelLinks: { include: { channel: true } } },
  });
  const due = enabled.filter(
    (m) => !m.lastCheckedAt || now - m.lastCheckedAt.getTime() >= m.intervalSeconds * 1000,
  );
  for (const m of due) {
    try {
      await runOne(m);
    } catch (e) {
      console.error(`[MonitorEngine] runOne("${m.name}") error:`, e);
    }
  }
}

/** 手動執行單一 monitor 一次(供 API 立即執行按鈕使用)。 */
export async function runOnce(monitorId: string): Promise<CheckResult | null> {
  const m = await prisma.monitor.findUnique({
    where: { id: monitorId },
    include: { channelLinks: { include: { channel: true } } },
  });
  if (!m) return null;
  const result = await runCheckWithGates(m);
  return result;
}

async function runCheckWithGates(monitor: MonitorWithChannels): Promise<CheckResult> {
  if (await isInMaintenance(monitor)) {
    const r: CheckResult = { result: 'SKIPPED', detail: 'in maintenance window' };
    await recordOnly(monitor, r, 'MAINTENANCE');
    return r;
  }
  if (!isInActiveHours(monitor)) {
    const r: CheckResult = { result: 'SKIPPED', detail: 'outside-active-hours' };
    await recordOnly(monitor, r);
    return r;
  }
  if (await isParentDown(monitor)) {
    const result = await runCheck(monitor);
    if (result.result === 'FAIL') {
      const r: CheckResult = { ...result, result: 'SKIPPED', detail: `suppressed-by-parent-down: ${result.detail ?? ''}` };
      await recordOnly(monitor, r);
      return r;
    }
    await applyResult(monitor, result);
    return result;
  }
  const result = await runCheck(monitor);
  await applyResult(monitor, result);
  return result;
}

async function runOne(monitor: MonitorWithChannels): Promise<void> {
  await runCheckWithGates(monitor);
}

// ── 各種 check kind ──────────────────────────────────────────────────────────
async function runCheck(monitor: Monitor): Promise<CheckResult> {
  switch (monitor.kind) {
    case 'HTTP':
    case 'KEYWORD':
      return runHttpCheck(monitor);
    case 'TCP':
      return runTcpCheck(monitor);
    case 'PUSH':
      return runPushCheck(monitor);
    case 'LOG':
      return runLogCheck(monitor);
    default:
      return { result: 'FAIL', detail: `unsupported kind: ${monitor.kind}` };
  }
}

async function runHttpCheck(m: Monitor): Promise<CheckResult> {
  if (!m.url) return { result: 'FAIL', detail: 'missing url' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), m.timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(m.url, {
      method: m.httpMethod ?? 'GET',
      headers: (m.httpHeaders as Record<string, string> | null) ?? undefined,
      body: m.httpBody ?? undefined,
      signal: ac.signal,
    });
    const latencyMs = Date.now() - t0;
    const statusOk = res.status >= m.expectedStatusLow && res.status <= m.expectedStatusHigh;
    if (!statusOk) {
      return {
        result: 'FAIL',
        latencyMs,
        magnitude: 1,
        detail: `HTTP ${res.status} (expected ${m.expectedStatusLow}-${m.expectedStatusHigh})`,
      };
    }
    if (m.kind === 'KEYWORD' || m.bodyKeywordInclude || m.bodyKeywordExclude) {
      const body = await res.text();
      if (m.bodyKeywordInclude && !body.includes(m.bodyKeywordInclude)) {
        return { result: 'FAIL', latencyMs, magnitude: 1, detail: `body missing keyword "${m.bodyKeywordInclude}"` };
      }
      if (m.bodyKeywordExclude && body.includes(m.bodyKeywordExclude)) {
        return { result: 'FAIL', latencyMs, magnitude: 1, detail: `body contains forbidden "${m.bodyKeywordExclude}"` };
      }
    }
    return { result: 'OK', latencyMs, magnitude: 0 };
  } catch (e: unknown) {
    const latencyMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    return { result: 'FAIL', latencyMs, magnitude: 1, detail: msg.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

async function runTcpCheck(m: Monitor): Promise<CheckResult> {
  if (!m.tcpHost || !m.tcpPort) return { result: 'FAIL', detail: 'missing tcpHost/tcpPort' };
  const t0 = Date.now();
  return new Promise<CheckResult>((resolve) => {
    const socket = net.createConnection({ host: m.tcpHost!, port: m.tcpPort!, timeout: m.timeoutMs });
    let done = false;
    const finish = (r: CheckResult) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(r);
    };
    socket.once('connect', () => finish({ result: 'OK', latencyMs: Date.now() - t0, magnitude: 0 }));
    socket.once('timeout', () =>
      finish({ result: 'FAIL', latencyMs: Date.now() - t0, magnitude: 1, detail: `tcp timeout (${m.timeoutMs}ms)` }),
    );
    socket.once('error', (err: Error) =>
      finish({ result: 'FAIL', latencyMs: Date.now() - t0, magnitude: 1, detail: err.message.slice(0, 200) }),
    );
  });
}

async function runPushCheck(m: Monitor): Promise<CheckResult> {
  const now = Date.now();
  if (!m.lastPushAt) {
    return { result: 'FAIL', magnitude: m.pushTimeoutSeconds, detail: 'no push received yet' };
  }
  const elapsedSec = Math.floor((now - m.lastPushAt.getTime()) / 1000);
  if (elapsedSec > m.pushTimeoutSeconds) {
    return { result: 'FAIL', magnitude: elapsedSec, detail: `no push for ${elapsedSec}s (limit ${m.pushTimeoutSeconds}s)` };
  }
  return { result: 'OK', magnitude: elapsedSec };
}

async function runLogCheck(m: Monitor): Promise<CheckResult> {
  if (!m.service || !m.logMode) return { result: 'FAIL', detail: 'missing service / logMode' };
  const since = new Date(Date.now() - m.logWindowMinutes * 60_000).toISOString();
  const serviceTerm = { term: { 'service.keyword': m.service } };
  const sinceRange = { range: { '@timestamp': { gte: since } } };
  const levels = m.logLevel === 'WARN_AND_ERROR' ? ['ERROR', 'WARN'] : ['ERROR'];
  try {
    if (m.logMode === 'ERROR_RATE') {
      const totalQ = await esSearch({ size: 0, query: { bool: { must: [serviceTerm, sinceRange] } } });
      const errQ = await esSearch({
        size: 0,
        query: { bool: { must: [serviceTerm, sinceRange, { terms: { 'level.keyword': levels } }] } },
      });
      const total: number = totalQ?.hits?.total?.value ?? 0;
      const errors: number = errQ?.hits?.total?.value ?? 0;
      const rate = total > 0 ? (errors / total) * 100 : 0;
      const threshold = m.errorRateThreshold ?? 10;
      return rate >= threshold
        ? {
            result: 'FAIL',
            magnitude: rate,
            detail: `errorRate ${rate.toFixed(1)}% ≥ ${threshold}% (errors ${errors}/${total} in ${m.logWindowMinutes}m)`,
          }
        : { result: 'OK', magnitude: rate };
    }
    if (m.logMode === 'ERROR_COUNT') {
      const r = await esSearch({
        size: 0,
        query: { bool: { must: [serviceTerm, sinceRange, { terms: { 'level.keyword': levels } }] } },
      });
      const count: number = r?.hits?.total?.value ?? 0;
      const threshold = m.errorCountThreshold ?? 10;
      return count >= threshold
        ? { result: 'FAIL', magnitude: count, detail: `errorCount ${count} ≥ ${threshold} in ${m.logWindowMinutes}m` }
        : { result: 'OK', magnitude: count };
    }
    if (m.logMode === 'LATENCY_P99') {
      const r = await esSearch({
        size: 0,
        query: { bool: { must: [serviceTerm, sinceRange] } },
        aggs: { p99: { percentiles: { field: 'durationMs', percents: [99] } } },
      });
      const p99: number = r?.aggregations?.p99?.values?.['99.0'] ?? 0;
      const threshold = m.latencyP99Threshold ?? 5000;
      return p99 >= threshold
        ? {
            result: 'FAIL',
            magnitude: p99,
            detail: `p99 latency ${p99.toFixed(0)}ms ≥ ${threshold}ms in ${m.logWindowMinutes}m`,
          }
        : { result: 'OK', magnitude: p99 };
    }
    if (m.logMode === 'KEYWORD') {
      if (!m.logKeyword) return { result: 'FAIL', detail: 'missing logKeyword' };
      const r = await esSearch({
        size: 0,
        query: {
          bool: {
            must: [serviceTerm, sinceRange, { multi_match: { query: m.logKeyword, fields: ['msg', 'message'] } }],
          },
        },
      });
      const count: number = r?.hits?.total?.value ?? 0;
      return count >= 1
        ? { result: 'FAIL', magnitude: count, detail: `${count} match(es) for "${m.logKeyword}" in ${m.logWindowMinutes}m` }
        : { result: 'OK', magnitude: 0 };
    }
    return { result: 'FAIL', detail: `unknown logMode ${m.logMode}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: 'SKIPPED', detail: `elasticsearch error: ${msg.slice(0, 150)}` };
  }
}

async function esSearch(body: unknown): Promise<any> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ES_QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(`${ELASTICSEARCH_URL}/selkie-logs-*/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`ES ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── 閘門:維護視窗 / 活躍時段 / 父相依 ────────────────────────────────────────
async function isInMaintenance(m: Monitor): Promise<boolean> {
  if (m.maintenanceUntil && m.maintenanceUntil > new Date()) return true;
  const now = new Date();
  const window = await prisma.maintenanceWindow.findFirst({
    where: {
      OR: [{ monitorId: null }, { monitorId: m.id }],
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
  });
  return !!window;
}

function isInActiveHours(m: Monitor): boolean {
  const sched = m.activeSchedule as
    | { timezone?: string; weekdays?: number[]; startHour?: number; endHour?: number }
    | null;
  if (!sched || !Array.isArray(sched.weekdays) || sched.startHour == null || sched.endHour == null) return true;
  const tz = sched.timezone || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wdName = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const wd = wdMap[wdName];
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  if (wd == null || !sched.weekdays.includes(wd)) return false;
  return hour >= sched.startHour && hour < sched.endHour;
}

async function isParentDown(m: Monitor): Promise<boolean> {
  if (!m.dependsOnMonitorId) return false;
  const parent = await prisma.monitor.findUnique({ where: { id: m.dependsOnMonitorId } });
  return parent?.state === 'DOWN';
}

// ── 寫紀錄 + 狀態機 ─────────────────────────────────────────────────────────
async function recordOnly(monitor: MonitorWithChannels, r: CheckResult, forceState?: 'MAINTENANCE'): Promise<void> {
  await prisma.monitorCheck.create({
    data: {
      monitorId: monitor.id,
      result: (r.result === 'SKIPPED' && forceState === 'MAINTENANCE' ? 'MAINTENANCE' : r.result) as MonitorCheckResult,
      magnitude: r.magnitude ?? null,
      latencyMs: r.latencyMs ?? null,
      detail: r.detail?.slice(0, 500) ?? null,
    },
  });
  await prisma.monitor.update({
    where: { id: monitor.id },
    data: {
      state: forceState === 'MAINTENANCE' ? 'MAINTENANCE' : monitor.state,
      lastCheckedAt: new Date(),
      lastResult: (r.result === 'SKIPPED' && forceState === 'MAINTENANCE' ? 'MAINTENANCE' : r.result) as MonitorCheckResult,
      lastLatencyMs: r.latencyMs ?? null,
      lastMagnitude: r.magnitude ?? null,
    },
  });
  await pruneChecks(monitor.id);
}

async function applyResult(monitor: MonitorWithChannels, r: CheckResult): Promise<void> {
  await prisma.monitorCheck.create({
    data: {
      monitorId: monitor.id,
      result: r.result as MonitorCheckResult,
      magnitude: r.magnitude ?? null,
      latencyMs: r.latencyMs ?? null,
      detail: r.detail?.slice(0, 500) ?? null,
    },
  });
  await pruneChecks(monitor.id);

  const baseUpdate = {
    lastCheckedAt: new Date(),
    lastResult: r.result as MonitorCheckResult,
    lastLatencyMs: r.latencyMs ?? null,
    lastMagnitude: r.magnitude ?? null,
  };

  if (r.result === 'FAIL') {
    const newFails = monitor.consecutiveFailures + 1;
    if (monitor.state !== 'DOWN' && newFails >= monitor.failureThreshold && !monitor.openIncidentId) {
      await transitionDown(monitor, r, newFails);
      return;
    }
    if (monitor.state === 'DOWN') {
      const now = Date.now();
      if (
        monitor.reAlertMinutes > 0 &&
        monitor.lastNotifiedAt &&
        now - monitor.lastNotifiedAt.getTime() >= monitor.reAlertMinutes * 60_000
      ) {
        await notifyChannels(monitor.channelLinks, 're-alert', monitor, toNotifyResult(r));
        await prisma.monitor.update({
          where: { id: monitor.id },
          data: { ...baseUpdate, consecutiveFailures: newFails, lastNotifiedAt: new Date() },
        });
        return;
      }
    }
    await prisma.monitor.update({
      where: { id: monitor.id },
      data: { ...baseUpdate, consecutiveFailures: newFails },
    });
    return;
  }

  // OK 或 SKIPPED:從 DOWN 恢復才走 recovery 流程,否則只更新 OK 狀態
  if (monitor.state === 'DOWN' && r.result === 'OK') {
    await transitionRecovery(monitor, r);
    return;
  }
  await prisma.monitor.update({
    where: { id: monitor.id },
    data: {
      ...baseUpdate,
      state: r.result === 'OK' ? 'UP' : monitor.state,
      consecutiveFailures: r.result === 'OK' ? 0 : monitor.consecutiveFailures,
    },
  });
}

async function transitionDown(monitor: MonitorWithChannels, r: CheckResult, newFails: number): Promise<void> {
  // 跨 monitor 事故附掛
  const service = monitor.service ?? 'unknown';
  const existing = await prisma.incident.findFirst({
    where: {
      service,
      status: { not: 'RESOLVED' },
      source: { in: ['monitor', 'generic', 'datadog', 'pagerduty', 'alertmanager'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  const severity = judgeSeverity(monitor, r.magnitude ?? 1);
  const title = renderIncidentTitle(monitor, r);
  let incidentId: string | null = null;

  if (existing) {
    incidentId = existing.id;
  } else {
    const owner = await findDefaultOwner();
    if (!owner) {
      console.error(`[MonitorEngine] no default owner — cannot create incident for ${monitor.name}`);
    } else {
      const actor: IncidentActor = {
        id: owner.id,
        email: owner.email,
        name: 'Selkie 主動監控',
      };
      try {
        const created = await createIncident(
          owner.id,
          {
            title,
            service,
            description: `監控 ${monitor.name}(${monitor.kind})偵測異常 —— ${r.detail ?? ''}`,
            severity,
            source: 'monitor',
          },
          actor,
        );
        if (created.success && created.data) {
          incidentId = created.data.id;
          if (monitor.autoTriage) {
            void startTriage(owner.id, incidentId, actor, true).catch((e: unknown) =>
              console.error('[MonitorEngine] startTriage error:', e),
            );
          }
        } else {
          console.error('[MonitorEngine] createIncident failed:', created.message);
        }
      } catch (e) {
        console.error('[MonitorEngine] createIncident threw:', e);
      }
    }
  }

  await notifyChannels(monitor.channelLinks, 'down', monitor, toNotifyResult(r));

  await prisma.monitor.update({
    where: { id: monitor.id },
    data: {
      lastCheckedAt: new Date(),
      lastResult: r.result as MonitorCheckResult,
      lastLatencyMs: r.latencyMs ?? null,
      lastMagnitude: r.magnitude ?? null,
      consecutiveFailures: newFails,
      state: 'DOWN',
      openIncidentId: incidentId,
      lastNotifiedAt: new Date(),
    },
  });
}

async function transitionRecovery(monitor: MonitorWithChannels, r: CheckResult): Promise<void> {
  if (monitor.openIncidentId) {
    try {
      const inc = await prisma.incident.findUnique({ where: { id: monitor.openIncidentId } });
      if (inc && inc.source === 'monitor' && inc.status !== 'RESOLVED') {
        await prisma.incident.update({ where: { id: monitor.openIncidentId }, data: { status: 'RESOLVED' } });
      }
    } catch (e) {
      console.error('[MonitorEngine] auto-resolve error:', e);
    }
  }
  await notifyChannels(monitor.channelLinks, 'recovery', monitor, toNotifyResult(r));
  await prisma.monitor.update({
    where: { id: monitor.id },
    data: {
      lastCheckedAt: new Date(),
      lastResult: r.result as MonitorCheckResult,
      lastLatencyMs: r.latencyMs ?? null,
      lastMagnitude: r.magnitude ?? null,
      consecutiveFailures: 0,
      state: 'UP',
      openIncidentId: null,
    },
  });
}

async function pruneChecks(monitorId: string): Promise<void> {
  const old = await prisma.monitorCheck.findMany({
    where: { monitorId },
    orderBy: { checkedAt: 'desc' },
    skip: CHECK_RETENTION,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.monitorCheck.deleteMany({ where: { id: { in: old.map((x) => x.id) } } });
  }
}

// ── 嚴重度判定(支援 ramp)+ 事故標題範本 ────────────────────────────────────
function judgeSeverity(monitor: Monitor, magnitude: number): IncidentSeverity {
  const ramp = monitor.severityRamp as
    | Array<{ atOrAbove: number; severity: IncidentSeverity }>
    | null;
  if (Array.isArray(ramp) && ramp.length > 0) {
    const sorted = [...ramp].sort((a, b) => b.atOrAbove - a.atOrAbove);
    for (const band of sorted) {
      if (magnitude >= band.atOrAbove) return band.severity;
    }
  }
  return monitor.severity;
}

function renderIncidentTitle(monitor: Monitor, r: CheckResult): string {
  const template = monitor.incidentTitleTemplate || `{{name}} 偵測到異常`;
  return template
    .replace(/\{\{name\}\}/g, monitor.name)
    .replace(/\{\{service\}\}/g, monitor.service ?? '')
    .replace(/\{\{kind\}\}/g, monitor.kind)
    .replace(/\{\{metric\}\}/g, String(r.magnitude ?? ''))
    .replace(/\{\{value\}\}/g, String(r.magnitude ?? ''))
    .replace(
      /\{\{threshold\}\}/g,
      String(monitor.errorRateThreshold ?? monitor.errorCountThreshold ?? monitor.latencyP99Threshold ?? ''),
    )
    .slice(0, 200);
}

function toNotifyResult(r: CheckResult): NotifyResult {
  return {
    result: r.result,
    magnitude: r.magnitude ?? null,
    latencyMs: r.latencyMs ?? null,
    detail: r.detail ?? null,
  };
}
