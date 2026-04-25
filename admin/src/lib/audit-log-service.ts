/**
 * 通用後台操作記錄服務
 * 將 CRUD 操作寫入 audit_logs 表
 */

import { prisma } from '@/lib/prisma';

export type AuditEntityType = 'Role' | 'Member' | 'RolePermission' | 'KanbanCard';
export type AuditAction = 'create' | 'update' | 'delete' | 'move';

export interface CreateAuditLogParams {
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string;
}

export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  const { actorId, actorEmail, actorName, entityType, entityId, action, oldValue, newValue, ipAddress } = params;
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        actorEmail: actorEmail ?? null,
        actorName: actorName ?? null,
        entityType,
        entityId,
        action,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (e) {
    console.error(`[audit-log-service] 寫入操作記錄失敗 entityType=${entityType} entityId=${entityId} action=${action}`, e);
  }
}

export function getIpFromRequest(request: { headers: { get: (key: string) => string | null } }): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? undefined;
}
