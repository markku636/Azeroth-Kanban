/**
 * 維護視窗 service —— MaintenanceWindow 的 CRUD。
 *
 * 維護視窗在 monitor-engine 的閘門檢查中使用:tick 起頭查當下是否有 active window,
 * 命中該 monitor(或全域 monitorId=null)→ 跳過狀態機、不開事故。
 *
 * 驗證重點:
 *   - startsAt < endsAt
 *   - reason 上限 300 字
 *   - monitorId 可為 null(全域)或合法 Monitor.id
 */
import type { Prisma } from '@prisma/client';

import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';
import { prisma } from '@/lib/prisma';

export interface MaintenanceActor {
  id: string;
  email: string | null;
  name: string | null;
  ipAddress?: string;
}

export interface MaintenanceWindowDto {
  id: string;
  monitorId: string | null;
  monitor: { id: string; name: string } | null;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdBy: { id: string; name: string; email: string };
  createdAt: Date;
  status: 'past' | 'active' | 'upcoming';
}

const include = {
  monitor: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MaintenanceWindowInclude;

type Row = Prisma.MaintenanceWindowGetPayload<{ include: typeof include }>;

function toDto(row: Row): MaintenanceWindowDto {
  const now = Date.now();
  const status: MaintenanceWindowDto['status'] =
    row.endsAt.getTime() < now ? 'past' : row.startsAt.getTime() <= now ? 'active' : 'upcoming';
  return {
    id: row.id,
    monitorId: row.monitorId,
    monitor: row.monitor,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    status,
  };
}

// ── 列表 ────────────────────────────────────────────────────────────────────
export async function listMaintenanceWindows(): Promise<ApiResult<MaintenanceWindowDto[]>> {
  try {
    const rows = await prisma.maintenanceWindow.findMany({
      orderBy: [{ startsAt: 'desc' }],
      include,
    });
    return ApiResponse.success(rows.map(toDto), '取得維護視窗列表成功');
  } catch (e) {
    console.error('[MaintenanceWindowService.list]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入維護視窗列表失敗');
  }
}

// ── 取得單一 ────────────────────────────────────────────────────────────────
export async function getMaintenanceWindow(id: string): Promise<ApiResult<MaintenanceWindowDto>> {
  try {
    const row = await prisma.maintenanceWindow.findUnique({ where: { id }, include });
    if (!row) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到維護視窗');
    return ApiResponse.success(toDto(row), '取得維護視窗成功');
  } catch (e) {
    console.error('[MaintenanceWindowService.get]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入維護視窗失敗');
  }
}

// ── 建立 ────────────────────────────────────────────────────────────────────
export async function createMaintenanceWindow(
  userId: string,
  input: Record<string, unknown>,
  actor: MaintenanceActor,
): Promise<ApiResult<MaintenanceWindowDto>> {
  const v = validateInput(input, 'create');
  if (!v.ok) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, v.message);
  try {
    // monitor 存在檢查
    if (v.data.monitorId) {
      const m = await prisma.monitor.findUnique({ where: { id: v.data.monitorId }, select: { id: true } });
      if (!m) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '指定的監控不存在');
    }
    const created = await prisma.maintenanceWindow.create({
      data: {
        monitorId: v.data.monitorId ?? null,
        startsAt: v.data.startsAt!,
        endsAt: v.data.endsAt!,
        reason: v.data.reason ?? null,
        createdById: userId,
      },
      include,
    });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'MaintenanceWindow',
      entityId: created.id,
      action: 'create',
      newValue: { monitorId: created.monitorId, startsAt: created.startsAt, endsAt: created.endsAt, reason: created.reason },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(created), '維護視窗已建立');
  } catch (e) {
    console.error('[MaintenanceWindowService.create]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立維護視窗失敗');
  }
}

// ── 更新 ────────────────────────────────────────────────────────────────────
export async function updateMaintenanceWindow(
  id: string,
  input: Record<string, unknown>,
  actor: MaintenanceActor,
): Promise<ApiResult<MaintenanceWindowDto>> {
  const v = validateInput(input, 'update');
  if (!v.ok) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, v.message);
  try {
    const existing = await prisma.maintenanceWindow.findUnique({ where: { id } });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到維護視窗');
    if (v.data.monitorId) {
      const m = await prisma.monitor.findUnique({ where: { id: v.data.monitorId }, select: { id: true } });
      if (!m) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '指定的監控不存在');
    }
    const updateData: Prisma.MaintenanceWindowUpdateInput = {};
    if (v.data.monitorId !== undefined) {
      updateData.monitor = v.data.monitorId
        ? { connect: { id: v.data.monitorId } }
        : { disconnect: true };
    }
    if (v.data.startsAt !== undefined) updateData.startsAt = v.data.startsAt;
    if (v.data.endsAt !== undefined) updateData.endsAt = v.data.endsAt;
    if (v.data.reason !== undefined) updateData.reason = v.data.reason;
    const updated = await prisma.maintenanceWindow.update({ where: { id }, data: updateData, include });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'MaintenanceWindow',
      entityId: id,
      action: 'update',
      oldValue: { startsAt: existing.startsAt, endsAt: existing.endsAt, reason: existing.reason },
      newValue: { startsAt: updated.startsAt, endsAt: updated.endsAt, reason: updated.reason },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(updated), '維護視窗已更新');
  } catch (e) {
    console.error('[MaintenanceWindowService.update]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新維護視窗失敗');
  }
}

// ── 刪除 ────────────────────────────────────────────────────────────────────
export async function deleteMaintenanceWindow(
  id: string,
  actor: MaintenanceActor,
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.maintenanceWindow.findUnique({ where: { id } });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到維護視窗');
    await prisma.maintenanceWindow.delete({ where: { id } });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'MaintenanceWindow',
      entityId: id,
      action: 'delete',
      oldValue: { startsAt: existing.startsAt, endsAt: existing.endsAt, reason: existing.reason },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success({ id }, '維護視窗已刪除');
  } catch (e) {
    console.error('[MaintenanceWindowService.delete]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除維護視窗失敗');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 驗證
// ─────────────────────────────────────────────────────────────────────────────

interface ValidatedMW {
  monitorId?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  reason?: string | null;
}

function validateInput(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): { ok: true; data: ValidatedMW } | { ok: false; message: string } {
  const out: ValidatedMW = {};

  if (input.monitorId !== undefined) {
    if (input.monitorId === null || input.monitorId === '') {
      out.monitorId = null;
    } else if (typeof input.monitorId === 'string') {
      out.monitorId = input.monitorId;
    } else {
      return { ok: false, message: 'monitorId 須為字串或 null' };
    }
  }

  if (mode === 'create' || input.startsAt !== undefined) {
    const d = parseDate(input.startsAt);
    if (!d) return { ok: false, message: 'startsAt 須為合法日期字串(ISO 8601)' };
    out.startsAt = d;
  }
  if (mode === 'create' || input.endsAt !== undefined) {
    const d = parseDate(input.endsAt);
    if (!d) return { ok: false, message: 'endsAt 須為合法日期字串(ISO 8601)' };
    out.endsAt = d;
  }
  if (out.startsAt && out.endsAt && out.startsAt.getTime() >= out.endsAt.getTime()) {
    return { ok: false, message: 'startsAt 須早於 endsAt' };
  }

  if (input.reason !== undefined) {
    if (input.reason === null || input.reason === '') {
      out.reason = null;
    } else if (typeof input.reason === 'string') {
      out.reason = input.reason.trim().slice(0, 300);
    } else {
      return { ok: false, message: 'reason 須為字串' };
    }
  }

  return { ok: true, data: out };
}

function parseDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
