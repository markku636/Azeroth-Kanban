/**
 * 事故 service —— Incident CRUD。三層架構的 service 層,不碰 NextRequest。
 * 回傳 ApiResult<T>(不拋錯),由 route 層以 ApiResponse.json() 包成 NextResponse。
 */
import type { IncidentSeverity, IncidentStatus, Prisma } from '@prisma/client';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';
import { prisma } from '@/lib/prisma';

export interface IncidentActor {
  id: string;
  email: string | null;
  name: string | null;
  ipAddress?: string;
}

export const INCIDENT_STATUSES: IncidentStatus[] = [
  'TRIGGERED',
  'INVESTIGATING',
  'MITIGATING',
  'RESOLVED',
];
export const INCIDENT_SEVERITIES: IncidentSeverity[] = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];

const incidentInclude = {
  owner: { select: { id: true, name: true, email: true } },
  agentRuns: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true, createdAt: true },
  },
} satisfies Prisma.IncidentInclude;

type IncidentRow = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

export interface IncidentDto {
  id: string;
  code: string;
  title: string;
  service: string;
  description: string | null;
  source: string;
  status: IncidentStatus;
  severity: IncidentSeverity | null;
  triggeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string; email: string };
  latestRun: { id: string; status: string; createdAt: Date } | null;
}

function toDto(row: IncidentRow): IncidentDto {
  const latest = row.agentRuns[0] ?? null;
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    service: row.service,
    description: row.description,
    source: row.source,
    status: row.status,
    severity: row.severity,
    triggeredAt: row.triggeredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owner: row.owner,
    latestRun: latest
      ? { id: latest.id, status: latest.status, createdAt: latest.createdAt }
      : null,
  };
}

/** 列出事故。canViewAll 為 false 時只列自己負責的。 */
export async function listIncidents(
  userId: string,
  canViewAll: boolean,
): Promise<ApiResult<IncidentDto[]>> {
  try {
    const rows = await prisma.incident.findMany({
      where: canViewAll ? {} : { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: incidentInclude,
    });
    return ApiResponse.success(rows.map(toDto), '取得事故列表成功');
  } catch (e) {
    console.error('[IncidentService.listIncidents]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入事故列表失敗');
  }
}

/** 取得單一事故。 */
export async function getIncident(
  userId: string,
  id: string,
  canViewAll: boolean,
): Promise<ApiResult<IncidentDto>> {
  try {
    const row = await prisma.incident.findFirst({
      where: canViewAll ? { id } : { id, ownerId: userId },
      include: incidentInclude,
    });
    if (!row) {
      return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到事故');
    }
    return ApiResponse.success(toDto(row), '取得事故成功');
  } catch (e) {
    console.error('[IncidentService.getIncident]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入事故失敗');
  }
}

/** 建立事故。 */
export async function createIncident(
  userId: string,
  input: Record<string, unknown>,
  actor: IncidentActor,
): Promise<ApiResult<IncidentDto>> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const service = typeof input.service === 'string' ? input.service.trim() : '';
  if (!title) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '事故標題為必填');
  }
  if (title.length > 200) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '事故標題過長（上限 200 字）');
  }
  if (!service) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '受影響服務為必填');
  }
  const severity =
    typeof input.severity === 'string' &&
    INCIDENT_SEVERITIES.includes(input.severity as IncidentSeverity)
      ? (input.severity as IncidentSeverity)
      : null;
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 4000)
      : null;
  const source =
    typeof input.source === 'string' && input.source.trim() ? input.source.trim() : 'manual';

  try {
    const count = await prisma.incident.count();
    const code = `INC-${2000 + count}`;
    const row = await prisma.incident.create({
      data: { code, title, service, description, severity, source, ownerId: userId },
      include: incidentInclude,
    });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'Incident',
      entityId: row.id,
      action: 'create',
      newValue: { code: row.code, title: row.title, service: row.service },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(row), '事故已建立');
  } catch (e) {
    console.error('[IncidentService.createIncident]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立事故失敗');
  }
}

/** 更新事故。canEditAll 為 false 時只能改自己負責的。 */
export async function updateIncident(
  userId: string,
  id: string,
  input: Record<string, unknown>,
  actor: IncidentActor,
  canEditAll: boolean,
): Promise<ApiResult<IncidentDto>> {
  try {
    const existing = await prisma.incident.findFirst({
      where: canEditAll ? { id } : { id, ownerId: userId },
    });
    if (!existing) {
      return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到事故');
    }
    const data: Prisma.IncidentUpdateInput = {};
    if (typeof input.title === 'string' && input.title.trim()) {
      data.title = input.title.trim().slice(0, 200);
    }
    if (typeof input.service === 'string' && input.service.trim()) {
      data.service = input.service.trim();
    }
    if (typeof input.description === 'string') {
      data.description = input.description.trim()
        ? input.description.trim().slice(0, 4000)
        : null;
    } else if (input.description === null) {
      data.description = null;
    }
    if (
      typeof input.status === 'string' &&
      INCIDENT_STATUSES.includes(input.status as IncidentStatus)
    ) {
      data.status = input.status as IncidentStatus;
    }
    if (
      typeof input.severity === 'string' &&
      INCIDENT_SEVERITIES.includes(input.severity as IncidentSeverity)
    ) {
      data.severity = input.severity as IncidentSeverity;
    } else if (input.severity === null) {
      data.severity = null;
    }

    const row = await prisma.incident.update({
      where: { id },
      data,
      include: incidentInclude,
    });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'Incident',
      entityId: id,
      action: 'update',
      oldValue: { status: existing.status, severity: existing.severity },
      newValue: { status: row.status, severity: row.severity },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success(toDto(row), '事故已更新');
  } catch (e) {
    console.error('[IncidentService.updateIncident]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新事故失敗');
  }
}

/** 刪除事故。 */
export async function deleteIncident(
  userId: string,
  id: string,
  actor: IncidentActor,
  canEditAll: boolean,
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.incident.findFirst({
      where: canEditAll ? { id } : { id, ownerId: userId },
    });
    if (!existing) {
      return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到事故');
    }
    await prisma.incident.delete({ where: { id } });
    await createAuditLog({
      actorId: actor.id,
      actorEmail: actor.email ?? undefined,
      actorName: actor.name ?? undefined,
      entityType: 'Incident',
      entityId: id,
      action: 'delete',
      oldValue: { code: existing.code, title: existing.title },
      ipAddress: actor.ipAddress,
    });
    return ApiResponse.success({ id }, '事故已刪除');
  } catch (e) {
    console.error('[IncidentService.deleteIncident]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除事故失敗');
  }
}
