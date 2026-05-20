/**
 * 主動監控 service —— Monitor 的 CRUD(列表 / 取得 / 新增 / 編輯 / 刪除)。
 *
 * 三層架構的 service 層:不碰 NextRequest,回 ApiResult<T>(不拋錯),由 route 層
 * 以 ApiResponse.json() 包成 NextResponse。寫稽核紀錄。
 *
 * 驗證重點:
 *   - intervalSeconds ≥ 15(避免比引擎 tick 還快)
 *   - HTTP/KEYWORD:url 可解析、status range 100–599、timeoutMs 1000–30000
 *   - TCP:tcpHost / tcpPort 必填,port 1–65535
 *   - PUSH:server 端產 pushToken,pushTimeoutSeconds ≥ 60
 *   - LOG:service 必填,依 logMode 校驗對應 threshold 欄位
 *   - severityRamp / activeSchedule JSON 結構驗證
 *   - dependsOnMonitorId 防自指,並偵測簡單環(往上爬 5 層)
 */
import { randomUUID } from 'node:crypto';

import type { IncidentSeverity, MonitorKind, MonitorLogMode, Prisma } from '@prisma/client';

import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';
import { prisma } from '@/lib/prisma';

export interface MonitorActor {
  id: string;
  email: string | null;
  name: string | null;
  ipAddress?: string;
}

export const MONITOR_KINDS: MonitorKind[] = ['HTTP', 'TCP', 'KEYWORD', 'PUSH', 'LOG'];
export const MONITOR_LOG_MODES: MonitorLogMode[] = ['ERROR_RATE', 'ERROR_COUNT', 'LATENCY_P99', 'KEYWORD'];
export const MONITOR_SEVERITIES: IncidentSeverity[] = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];

const monitorInclude = {
  channelLinks: {
    include: { channel: { select: { id: true, name: true, kind: true } } },
  },
  dependsOn: { select: { id: true, name: true, state: true } },
  owner: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MonitorInclude;

type MonitorRow = Prisma.MonitorGetPayload<{ include: typeof monitorInclude }>;

export interface MonitorDto {
  id: string;
  name: string;
  kind: MonitorKind;
  enabled: boolean;
  intervalSeconds: number;
  severity: IncidentSeverity;
  severityRamp: unknown;
  autoTriage: boolean;
  failureThreshold: number;
  reAlertMinutes: number;
  incidentTitleTemplate: string | null;
  // HTTP / KEYWORD
  url: string | null;
  httpMethod: string | null;
  httpHeaders: unknown;
  httpBody: string | null;
  expectedStatusLow: number;
  expectedStatusHigh: number;
  bodyKeywordInclude: string | null;
  bodyKeywordExclude: string | null;
  timeoutMs: number;
  // TCP
  tcpHost: string | null;
  tcpPort: number | null;
  // PUSH
  pushToken: string | null;
  pushTimeoutSeconds: number;
  lastPushAt: Date | null;
  // LOG
  service: string | null;
  logMode: MonitorLogMode | null;
  logWindowMinutes: number;
  logLevel: string;
  errorRateThreshold: number | null;
  errorCountThreshold: number | null;
  latencyP99Threshold: number | null;
  logKeyword: string | null;
  // 維護 / 標籤 / 分組 / 相依 / 活躍時段
  maintenanceUntil: Date | null;
  tags: string[];
  groupName: string | null;
  dependsOn: { id: string; name: string; state: string } | null;
  activeSchedule: unknown;
  // 執行期狀態
  state: string;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
  lastResult: string | null;
  lastLatencyMs: number | null;
  lastMagnitude: number | null;
  openIncidentId: string | null;
  lastNotifiedAt: Date | null;
  // 關聯 + 時間戳
  channels: Array<{ id: string; name: string; kind: string }>;
  owner: { id: string; name: string; email: string };
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: MonitorRow): MonitorDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    enabled: row.enabled,
    intervalSeconds: row.intervalSeconds,
    severity: row.severity,
    severityRamp: row.severityRamp,
    autoTriage: row.autoTriage,
    failureThreshold: row.failureThreshold,
    reAlertMinutes: row.reAlertMinutes,
    incidentTitleTemplate: row.incidentTitleTemplate,
    url: row.url,
    httpMethod: row.httpMethod,
    httpHeaders: row.httpHeaders,
    httpBody: row.httpBody,
    expectedStatusLow: row.expectedStatusLow,
    expectedStatusHigh: row.expectedStatusHigh,
    bodyKeywordInclude: row.bodyKeywordInclude,
    bodyKeywordExclude: row.bodyKeywordExclude,
    timeoutMs: row.timeoutMs,
    tcpHost: row.tcpHost,
    tcpPort: row.tcpPort,
    pushToken: row.pushToken,
    pushTimeoutSeconds: row.pushTimeoutSeconds,
    lastPushAt: row.lastPushAt,
    service: row.service,
    logMode: row.logMode,
    logWindowMinutes: row.logWindowMinutes,
    logLevel: row.logLevel,
    errorRateThreshold: row.errorRateThreshold,
    errorCountThreshold: row.errorCountThreshold,
    latencyP99Threshold: row.latencyP99Threshold,
    logKeyword: row.logKeyword,
    maintenanceUntil: row.maintenanceUntil,
    tags: row.tags,
    groupName: row.groupName,
    dependsOn: row.dependsOn,
    activeSchedule: row.activeSchedule,
    state: row.state,
    consecutiveFailures: row.consecutiveFailures,
    lastCheckedAt: row.lastCheckedAt,
    lastResult: row.lastResult,
    lastLatencyMs: row.lastLatencyMs,
    lastMagnitude: row.lastMagnitude,
    openIncidentId: row.openIncidentId,
    lastNotifiedAt: row.lastNotifiedAt,
    channels: row.channelLinks.map((l) => ({
      id: l.channel.id,
      name: l.channel.name,
      kind: l.channel.kind,
    })),
    owner: row.owner,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── 列表 ────────────────────────────────────────────────────────────────────
export async function listMonitors(): Promise<ApiResult<MonitorDto[]>> {
  try {
    const rows = await prisma.monitor.findMany({
      orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
      include: monitorInclude,
    });
    return ApiResponse.success(rows.map(toDto), '取得監控列表成功');
  } catch (e) {
    console.error('[MonitorService.listMonitors]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入監控列表失敗');
  }
}

// ── 取得單一 ────────────────────────────────────────────────────────────────
export async function getMonitor(id: string): Promise<ApiResult<MonitorDto & { recentChecks: MonitorCheckDto[] }>> {
  try {
    const row = await prisma.monitor.findUnique({
      where: { id },
      include: {
        ...monitorInclude,
        checks: { orderBy: { checkedAt: 'desc' }, take: 50 },
      },
    });
    if (!row) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到監控');
    const dto = toDto(row);
    const recentChecks: MonitorCheckDto[] = row.checks.map((c) => ({
      id: c.id,
      result: c.result,
      magnitude: c.magnitude,
      latencyMs: c.latencyMs,
      detail: c.detail,
      checkedAt: c.checkedAt,
    }));
    return ApiResponse.success({ ...dto, recentChecks }, '取得監控成功');
  } catch (e) {
    console.error('[MonitorService.getMonitor]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入監控失敗');
  }
}

export interface MonitorCheckDto {
  id: string;
  result: string;
  magnitude: number | null;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: Date;
}

// ── 建立 ────────────────────────────────────────────────────────────────────
export async function createMonitor(
  userId: string,
  input: Record<string, unknown>,
  actor: MonitorActor,
): Promise<ApiResult<MonitorDto>> {
  const v = validateInput(input, 'create');
  if (!v.ok) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, v.message);
  const data = v.data;

  try {
    // 環檢測(若有設 dependsOnMonitorId)
    if (data.dependsOnMonitorId) {
      const cycle = await hasCycle(data.dependsOnMonitorId, null);
      if (cycle) {
        return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '相依設定會造成迴圈');
      }
    }

    const created = await prisma.monitor.create({
      data: {
        ...data,
        ownerId: userId,
        pushToken: data.kind === 'PUSH' ? randomUUID() : null,
        channelLinks: data.channelIds
          ? {
              create: data.channelIds.map((channelId) => ({
                channelId,
                notifyOnDown: true,
                notifyOnRecovery: true,
                notifyOnReAlert: false,
              })),
            }
          : undefined,
      },
      include: monitorInclude,
    });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'Monitor',
      entityId: created.id,
      action: 'create',
      newValue: { name: created.name, kind: created.kind, service: created.service },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(created), '監控已建立');
  } catch (e: unknown) {
    if (isPrismaUniqueError(e)) {
      return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '監控名稱已存在');
    }
    console.error('[MonitorService.createMonitor]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立監控失敗');
  }
}

// ── 更新 ────────────────────────────────────────────────────────────────────
export async function updateMonitor(
  id: string,
  input: Record<string, unknown>,
  actor: MonitorActor,
): Promise<ApiResult<MonitorDto>> {
  const v = validateInput(input, 'update');
  if (!v.ok) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, v.message);
  const data = v.data;

  try {
    const existing = await prisma.monitor.findUnique({ where: { id } });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到監控');

    // 環檢測
    if (data.dependsOnMonitorId) {
      if (data.dependsOnMonitorId === id) {
        return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '不能依賴自己');
      }
      const cycle = await hasCycle(data.dependsOnMonitorId, id);
      if (cycle) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '相依設定會造成迴圈');
    }

    // 啟/停用切換時重置執行期狀態
    const stateOverride =
      data.enabled !== undefined && data.enabled !== existing.enabled
        ? data.enabled
          ? { state: 'PENDING' as const, consecutiveFailures: 0, openIncidentId: null }
          : { state: 'PAUSED' as const }
        : {};

    const updateData: Prisma.MonitorUpdateInput = { ...data, ...stateOverride };
    // channelLinks 不在 create input shape;用 set / disconnect / connect 較複雜。簡化:
    // 重新建立關聯(刪除舊的、建立新的)。
    const channelIds = data.channelIds;
    delete (updateData as { channelIds?: unknown }).channelIds;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.monitor.update({
        where: { id },
        data: updateData,
        include: monitorInclude,
      });
      if (channelIds !== undefined) {
        await tx.monitorChannel.deleteMany({ where: { monitorId: id } });
        if (channelIds.length > 0) {
          await tx.monitorChannel.createMany({
            data: channelIds.map((channelId) => ({
              monitorId: id,
              channelId,
              notifyOnDown: true,
              notifyOnRecovery: true,
              notifyOnReAlert: false,
            })),
          });
        }
      }
      return tx.monitor.findUniqueOrThrow({ where: { id }, include: monitorInclude });
    });

    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'Monitor',
      entityId: id,
      action: 'update',
      oldValue: { enabled: existing.enabled, severity: existing.severity, kind: existing.kind },
      newValue: { enabled: updated.enabled, severity: updated.severity, kind: updated.kind },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(updated), '監控已更新');
  } catch (e: unknown) {
    if (isPrismaUniqueError(e)) {
      return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '監控名稱已存在');
    }
    console.error('[MonitorService.updateMonitor]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新監控失敗');
  }
}

// ── 刪除 ────────────────────────────────────────────────────────────────────
export async function deleteMonitor(id: string, actor: MonitorActor): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.monitor.findUnique({ where: { id } });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到監控');
    await prisma.monitor.delete({ where: { id } });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'Monitor',
      entityId: id,
      action: 'delete',
      oldValue: { name: existing.name, kind: existing.kind },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success({ id }, '監控已刪除');
  } catch (e) {
    console.error('[MonitorService.deleteMonitor]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除監控失敗');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 驗證 + 工具
// ─────────────────────────────────────────────────────────────────────────────

interface ValidatedMonitorData extends Omit<Prisma.MonitorUncheckedCreateInput, 'ownerId' | 'pushToken' | 'createdAt' | 'updatedAt'> {
  channelIds?: string[];
}

function validateInput(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): { ok: true; data: ValidatedMonitorData } | { ok: false; message: string } {
  const data: Record<string, unknown> = { ...input };

  // name
  if (mode === 'create') {
    if (typeof data.name !== 'string' || !data.name.trim()) return { ok: false, message: '名稱為必填' };
    data.name = (data.name as string).trim().slice(0, 120);
  } else if (data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim()) return { ok: false, message: '名稱不可為空' };
    data.name = (data.name as string).trim().slice(0, 120);
  }

  // kind
  if (mode === 'create') {
    if (typeof data.kind !== 'string' || !MONITOR_KINDS.includes(data.kind as MonitorKind)) {
      return { ok: false, message: `kind 必須為 ${MONITOR_KINDS.join('/')} 之一` };
    }
  } else if (data.kind !== undefined && !MONITOR_KINDS.includes(data.kind as MonitorKind)) {
    return { ok: false, message: `kind 必須為 ${MONITOR_KINDS.join('/')} 之一` };
  }

  // intervalSeconds
  if (data.intervalSeconds !== undefined) {
    const n = Number(data.intervalSeconds);
    if (!Number.isFinite(n) || n < 15) return { ok: false, message: 'intervalSeconds 須 ≥ 15' };
    data.intervalSeconds = Math.floor(n);
  }

  // severity
  if (data.severity !== undefined && !MONITOR_SEVERITIES.includes(data.severity as IncidentSeverity)) {
    return { ok: false, message: `severity 必須為 ${MONITOR_SEVERITIES.join('/')} 之一` };
  }

  // failureThreshold / reAlertMinutes / timeoutMs
  if (data.failureThreshold !== undefined) {
    const n = Number(data.failureThreshold);
    if (!Number.isFinite(n) || n < 1) return { ok: false, message: 'failureThreshold 須 ≥ 1' };
    data.failureThreshold = Math.floor(n);
  }
  if (data.reAlertMinutes !== undefined) {
    const n = Number(data.reAlertMinutes);
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: 'reAlertMinutes 須 ≥ 0' };
    data.reAlertMinutes = Math.floor(n);
  }
  if (data.timeoutMs !== undefined) {
    const n = Number(data.timeoutMs);
    if (!Number.isFinite(n) || n < 1000 || n > 30000) return { ok: false, message: 'timeoutMs 須在 1000–30000' };
    data.timeoutMs = Math.floor(n);
  }

  // HTTP / KEYWORD specific
  const kind = data.kind as MonitorKind | undefined;
  if (kind === 'HTTP' || kind === 'KEYWORD') {
    if (mode === 'create' && (typeof data.url !== 'string' || !data.url.trim())) {
      return { ok: false, message: 'HTTP / KEYWORD 監控的 url 必填' };
    }
    if (typeof data.url === 'string' && data.url.trim()) {
      try {
        new URL(data.url);
      } catch {
        return { ok: false, message: 'url 格式不正確' };
      }
    }
    if (data.expectedStatusLow !== undefined && data.expectedStatusHigh !== undefined) {
      const lo = Number(data.expectedStatusLow);
      const hi = Number(data.expectedStatusHigh);
      if (lo < 100 || hi > 599 || lo > hi) {
        return { ok: false, message: 'expectedStatus 範圍須在 100–599 且 low ≤ high' };
      }
      data.expectedStatusLow = Math.floor(lo);
      data.expectedStatusHigh = Math.floor(hi);
    }
  }

  // TCP specific
  if (kind === 'TCP') {
    if (mode === 'create') {
      if (typeof data.tcpHost !== 'string' || !data.tcpHost.trim()) return { ok: false, message: 'TCP 監控的 tcpHost 必填' };
      const port = Number(data.tcpPort);
      if (!Number.isFinite(port) || port < 1 || port > 65535) return { ok: false, message: 'tcpPort 須在 1–65535' };
      data.tcpPort = Math.floor(port);
    }
  }

  // PUSH specific
  if (kind === 'PUSH') {
    if (data.pushTimeoutSeconds !== undefined) {
      const n = Number(data.pushTimeoutSeconds);
      if (!Number.isFinite(n) || n < 60) return { ok: false, message: 'pushTimeoutSeconds 須 ≥ 60' };
      data.pushTimeoutSeconds = Math.floor(n);
    }
  }

  // LOG specific
  if (kind === 'LOG') {
    if (mode === 'create' && (typeof data.service !== 'string' || !data.service.trim())) {
      return { ok: false, message: 'LOG 監控的 service 必填' };
    }
    if (data.logMode !== undefined && !MONITOR_LOG_MODES.includes(data.logMode as MonitorLogMode)) {
      return { ok: false, message: `logMode 必須為 ${MONITOR_LOG_MODES.join('/')} 之一` };
    }
    const lm = data.logMode as MonitorLogMode | undefined;
    if (mode === 'create' && lm) {
      if (lm === 'ERROR_RATE' && data.errorRateThreshold == null) return { ok: false, message: 'ERROR_RATE 模式需 errorRateThreshold' };
      if (lm === 'ERROR_COUNT' && data.errorCountThreshold == null) return { ok: false, message: 'ERROR_COUNT 模式需 errorCountThreshold' };
      if (lm === 'LATENCY_P99' && data.latencyP99Threshold == null) return { ok: false, message: 'LATENCY_P99 模式需 latencyP99Threshold' };
      if (lm === 'KEYWORD' && !data.logKeyword) return { ok: false, message: 'KEYWORD 模式需 logKeyword' };
    }
    if (data.logWindowMinutes !== undefined) {
      const n = Number(data.logWindowMinutes);
      if (!Number.isFinite(n) || n < 1 || n > 60) return { ok: false, message: 'logWindowMinutes 須在 1–60' };
      data.logWindowMinutes = Math.floor(n);
    }
  }

  // severityRamp 結構驗證
  if (data.severityRamp !== undefined && data.severityRamp !== null) {
    if (!Array.isArray(data.severityRamp)) return { ok: false, message: 'severityRamp 須為陣列' };
    for (const band of data.severityRamp as unknown[]) {
      if (
        !band ||
        typeof band !== 'object' ||
        typeof (band as { atOrAbove?: unknown }).atOrAbove !== 'number' ||
        !MONITOR_SEVERITIES.includes((band as { severity?: unknown }).severity as IncidentSeverity)
      ) {
        return { ok: false, message: 'severityRamp 元素須為 { atOrAbove: number, severity: SEV1..4 }' };
      }
    }
  }

  // activeSchedule 結構驗證
  if (data.activeSchedule !== undefined && data.activeSchedule !== null) {
    const s = data.activeSchedule as Record<string, unknown>;
    if (
      !Array.isArray(s.weekdays) ||
      typeof s.startHour !== 'number' ||
      typeof s.endHour !== 'number' ||
      s.startHour < 0 ||
      s.endHour > 24 ||
      s.startHour >= s.endHour
    ) {
      return {
        ok: false,
        message: 'activeSchedule 須為 { timezone?, weekdays:number[], startHour:0-23, endHour:1-24 } 且 startHour < endHour',
      };
    }
  }

  // tags 標準化
  if (Array.isArray(data.tags)) {
    const set = new Set<string>();
    for (const t of data.tags) {
      if (typeof t === 'string' && t.trim()) set.add(t.trim().toLowerCase());
    }
    data.tags = Array.from(set);
  }

  // channelIds
  if (data.channelIds !== undefined) {
    if (!Array.isArray(data.channelIds) || data.channelIds.some((x) => typeof x !== 'string')) {
      return { ok: false, message: 'channelIds 須為字串陣列' };
    }
  }

  // dependsOnMonitorId
  if (data.dependsOnMonitorId !== undefined && data.dependsOnMonitorId !== null && typeof data.dependsOnMonitorId !== 'string') {
    return { ok: false, message: 'dependsOnMonitorId 須為字串或 null' };
  }

  return { ok: true, data: data as unknown as ValidatedMonitorData };
}

async function hasCycle(targetParentId: string, selfId: string | null): Promise<boolean> {
  // 從 targetParentId 出發,往上爬 5 層;若遇到 selfId 即環。
  let cursor: string | null = targetParentId;
  for (let depth = 0; depth < 5 && cursor; depth += 1) {
    if (cursor === selfId) return true;
    const m: { dependsOnMonitorId: string | null } | null = await prisma.monitor.findUnique({
      where: { id: cursor },
      select: { dependsOnMonitorId: true },
    });
    if (!m) return false;
    cursor = m.dependsOnMonitorId;
  }
  return false;
}

function isPrismaUniqueError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 'P2002'
  );
}
