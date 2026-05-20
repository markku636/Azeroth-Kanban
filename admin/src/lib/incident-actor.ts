/**
 * 由 session + request 組出 IncidentActor(供稽核紀錄用)。
 */
import type { NextRequest } from 'next/server';
import { getIpFromRequest } from '@/lib/audit-log-service';
import type { IncidentActor } from '@/lib/incident-service';

export function buildIncidentActor(
  user: { memberId: string; email?: string | null; name?: string | null },
  request: NextRequest,
): IncidentActor {
  return {
    id: user.memberId,
    email: user.email ?? null,
    name: user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}
