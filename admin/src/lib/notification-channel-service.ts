/**
 * 通知通道 service —— NotificationChannel 的 CRUD + test。
 *
 * 三層架構的 service 層:不碰 NextRequest,回 ApiResult<T>(不拋錯),由 route 層
 * 以 ApiResponse.json() 包成 NextResponse。寫稽核紀錄。
 *
 * 驗證重點(依 kind):
 *   - SLACK_WEBHOOK: config.webhookUrl 必填、可解析為 URL
 *   - GENERIC_WEBHOOK: config.url 必填、可解析為 URL;config.headers 可選
 *   - CONSOLE: config 可空(寫 admin log,demo / dev 用)
 *   - delete:檢查是否有 monitor 還連著(MonitorChannel),有的話拒絕
 */
import type { NotificationChannelKind, Prisma } from '@prisma/client';

import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';
import { notifyChannels } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';

export interface ChannelActor {
  id: string;
  email: string | null;
  name: string | null;
  ipAddress?: string;
}

export const CHANNEL_KINDS: NotificationChannelKind[] = ['SLACK_WEBHOOK', 'GENERIC_WEBHOOK', 'CONSOLE'];

export interface NotificationChannelDto {
  id: string;
  name: string;
  kind: NotificationChannelKind;
  config: Record<string, unknown>;
  enabled: boolean;
  owner: { id: string; name: string; email: string };
  linkedMonitorCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type ChannelRow = Prisma.NotificationChannelGetPayload<{
  include: {
    owner: { select: { id: true; name: true; email: true } };
    _count: { select: { monitors: true } };
  };
}>;

const channelInclude = {
  owner: { select: { id: true, name: true, email: true } },
  _count: { select: { monitors: true } },
} satisfies Prisma.NotificationChannelInclude;

function toDto(row: ChannelRow): NotificationChannelDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    config: (row.config ?? {}) as Record<string, unknown>,
    enabled: row.enabled,
    owner: row.owner,
    linkedMonitorCount: row._count.monitors,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── 列表 ────────────────────────────────────────────────────────────────────
export async function listChannels(): Promise<ApiResult<NotificationChannelDto[]>> {
  try {
    const rows = await prisma.notificationChannel.findMany({
      orderBy: { name: 'asc' },
      include: channelInclude,
    });
    return ApiResponse.success(rows.map(toDto), '取得通知通道列表成功');
  } catch (e) {
    console.error('[NotificationChannelService.listChannels]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入通知通道列表失敗');
  }
}

// ── 取得單一 ────────────────────────────────────────────────────────────────
export async function getChannel(id: string): Promise<ApiResult<NotificationChannelDto>> {
  try {
    const row = await prisma.notificationChannel.findUnique({
      where: { id },
      include: channelInclude,
    });
    if (!row) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到通知通道');
    return ApiResponse.success(toDto(row), '取得通知通道成功');
  } catch (e) {
    console.error('[NotificationChannelService.getChannel]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入通知通道失敗');
  }
}

// ── 建立 ────────────────────────────────────────────────────────────────────
export async function createChannel(
  userId: string,
  input: Record<string, unknown>,
  actor: ChannelActor,
): Promise<ApiResult<NotificationChannelDto>> {
  const v = validateInput(input, 'create');
  if (!v.ok) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, v.message);
  try {
    const created = await prisma.notificationChannel.create({
      data: {
        name: v.data.name!,
        kind: v.data.kind!,
        config: (v.data.config ?? {}) as Prisma.InputJsonValue,
        enabled: v.data.enabled ?? true,
        ownerId: userId,
      },
      include: channelInclude,
    });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'NotificationChannel',
      entityId: created.id,
      action: 'create',
      newValue: { name: created.name, kind: created.kind, enabled: created.enabled },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(created), '通知通道已建立');
  } catch (e: unknown) {
    if (isPrismaUniqueError(e)) {
      return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '通知通道名稱已存在');
    }
    console.error('[NotificationChannelService.createChannel]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立通知通道失敗');
  }
}

// ── 更新 ────────────────────────────────────────────────────────────────────
export async function updateChannel(
  id: string,
  input: Record<string, unknown>,
  actor: ChannelActor,
): Promise<ApiResult<NotificationChannelDto>> {
  const v = validateInput(input, 'update');
  if (!v.ok) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, v.message);
  try {
    const existing = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到通知通道');
    const updateData: Prisma.NotificationChannelUpdateInput = {};
    if (v.data.name !== undefined) updateData.name = v.data.name;
    if (v.data.kind !== undefined) updateData.kind = v.data.kind;
    if (v.data.config !== undefined) updateData.config = v.data.config as Prisma.InputJsonValue;
    if (v.data.enabled !== undefined) updateData.enabled = v.data.enabled;
    const updated = await prisma.notificationChannel.update({
      where: { id },
      data: updateData,
      include: channelInclude,
    });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'NotificationChannel',
      entityId: id,
      action: 'update',
      oldValue: { name: existing.name, kind: existing.kind, enabled: existing.enabled },
      newValue: { name: updated.name, kind: updated.kind, enabled: updated.enabled },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(updated), '通知通道已更新');
  } catch (e: unknown) {
    if (isPrismaUniqueError(e)) {
      return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '通知通道名稱已存在');
    }
    console.error('[NotificationChannelService.updateChannel]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新通知通道失敗');
  }
}

// ── 刪除 ────────────────────────────────────────────────────────────────────
export async function deleteChannel(id: string, actor: ChannelActor): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.notificationChannel.findUnique({
      where: { id },
      include: { _count: { select: { monitors: true } } },
    });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到通知通道');
    if (existing._count.monitors > 0) {
      return ApiResponse.error(
        ApiReturnCode.VALIDATION_ERROR,
        `仍有 ${existing._count.monitors} 個監控綁定此通道,請先解除綁定`,
      );
    }
    await prisma.notificationChannel.delete({ where: { id } });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'NotificationChannel',
      entityId: id,
      action: 'delete',
      oldValue: { name: existing.name, kind: existing.kind },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success({ id }, '通知通道已刪除');
  } catch (e) {
    console.error('[NotificationChannelService.deleteChannel]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除通知通道失敗');
  }
}

// ── 測試 ────────────────────────────────────────────────────────────────────
export async function testChannel(id: string): Promise<ApiResult<{ sent: boolean }>> {
  try {
    const channel = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!channel) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到通知通道');
    if (!channel.enabled) {
      return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '通道已停用,請先啟用再測試');
    }
    // 建一個 fake monitor link 給 notifyChannels 用
    const fakeMonitor = {
      id: 'test-monitor',
      name: '[測試訊息] 通知通道驗證',
      kind: 'HTTP',
      service: 'channel-test',
      state: 'UP',
    } as unknown as Parameters<typeof notifyChannels>[2];
    const fakeLink = {
      id: 'test-link',
      monitorId: 'test-monitor',
      channelId: channel.id,
      notifyOnDown: true,
      notifyOnRecovery: true,
      notifyOnReAlert: true,
      channel,
    };
    await notifyChannels([fakeLink], 'down', fakeMonitor, {
      result: 'FAIL',
      detail: '此為來自 admin 的測試訊息,通道正常運作中',
    });
    return ApiResponse.success({ sent: true }, '測試訊息已發送');
  } catch (e) {
    console.error('[NotificationChannelService.testChannel]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '測試通知失敗');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 驗證
// ─────────────────────────────────────────────────────────────────────────────

interface ValidatedChannelData {
  name?: string;
  kind?: NotificationChannelKind;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

function validateInput(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): { ok: true; data: ValidatedChannelData } | { ok: false; message: string } {
  const out: ValidatedChannelData = {};

  // name
  if (mode === 'create') {
    if (typeof input.name !== 'string' || !input.name.trim()) return { ok: false, message: '名稱為必填' };
    out.name = input.name.trim().slice(0, 120);
  } else if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) return { ok: false, message: '名稱不可為空' };
    out.name = input.name.trim().slice(0, 120);
  }

  // kind
  if (mode === 'create') {
    if (typeof input.kind !== 'string' || !CHANNEL_KINDS.includes(input.kind as NotificationChannelKind)) {
      return { ok: false, message: `kind 必須為 ${CHANNEL_KINDS.join('/')} 之一` };
    }
    out.kind = input.kind as NotificationChannelKind;
  } else if (input.kind !== undefined) {
    if (!CHANNEL_KINDS.includes(input.kind as NotificationChannelKind)) {
      return { ok: false, message: `kind 必須為 ${CHANNEL_KINDS.join('/')} 之一` };
    }
    out.kind = input.kind as NotificationChannelKind;
  }

  // config(依 kind)
  if (input.config !== undefined) {
    if (typeof input.config !== 'object' || input.config === null || Array.isArray(input.config)) {
      return { ok: false, message: 'config 須為物件' };
    }
    const cfg = input.config as Record<string, unknown>;
    const k = out.kind;
    if (k === 'SLACK_WEBHOOK') {
      if (typeof cfg.webhookUrl !== 'string' || !cfg.webhookUrl.trim()) {
        return { ok: false, message: 'SLACK_WEBHOOK 須提供 config.webhookUrl' };
      }
      try {
        new URL(cfg.webhookUrl);
      } catch {
        return { ok: false, message: 'config.webhookUrl 格式不正確' };
      }
    }
    if (k === 'GENERIC_WEBHOOK') {
      if (typeof cfg.url !== 'string' || !cfg.url.trim()) {
        return { ok: false, message: 'GENERIC_WEBHOOK 須提供 config.url' };
      }
      try {
        new URL(cfg.url);
      } catch {
        return { ok: false, message: 'config.url 格式不正確' };
      }
      if (cfg.headers !== undefined) {
        if (typeof cfg.headers !== 'object' || cfg.headers === null || Array.isArray(cfg.headers)) {
          return { ok: false, message: 'config.headers 須為物件' };
        }
      }
    }
    out.config = cfg;
  } else if (mode === 'create') {
    // 沒帶 config 時,CONSOLE 給空物件即可,其他種類必填
    if (out.kind === 'CONSOLE') out.config = {};
    else return { ok: false, message: '此通道種類需提供 config' };
  }

  // enabled
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return { ok: false, message: 'enabled 須為 boolean' };
    out.enabled = input.enabled;
  }

  return { ok: true, data: out };
}

function isPrismaUniqueError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 'P2002'
  );
}
