import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { listProjects, createProject, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

export const GET = withPermission(PERMISSIONS.STUDIO_VIEW, async () => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  const all = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  return ApiResponse.json(await listProjects(memberId, all));
});

export const POST = withPermission(PERMISSIONS.STUDIO_CREATE, async (request: NextRequest) => {
  const session = await auth();
  const ownerId = session?.user?.memberId;
  if (!ownerId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  let body: { title?: unknown; description?: unknown; aspect?: unknown; fps?: unknown };
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  return ApiResponse.json(
    await createProject(
      ownerId,
      {
        title: typeof body.title === 'string' ? body.title : '',
        description: typeof body.description === 'string' ? body.description : undefined,
        aspect: typeof body.aspect === 'string' ? body.aspect : undefined,
        fps: typeof body.fps === 'number' ? body.fps : undefined,
      },
      buildActor(session, request),
    ),
  );
});
