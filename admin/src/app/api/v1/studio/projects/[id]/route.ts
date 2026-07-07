import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject, updateProject, deleteProject, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export const GET = withPermission(
  PERMISSIONS.STUDIO_VIEW,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
    return ApiResponse.json(await getProject(memberId, id, { bypassOwnership: bypass }));
  },
);

export const PATCH = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    return ApiResponse.json(
      await updateProject(
        memberId,
        id,
        {
          title: str(body.title),
          description: str(body.description),
          logline: str(body.logline),
          status: str(body.status),
          aspect: str(body.aspect),
          fps: typeof body.fps === 'number' ? body.fps : undefined,
          renderQuality: str(body.renderQuality),
          stylePreset: body.stylePreset === null ? null : str(body.stylePreset), // null＝清空回預設風格
          bgmGain: typeof body.bgmGain === 'number' ? body.bgmGain : undefined,
          subtitleStyle: body.subtitleStyle && typeof body.subtitleStyle === 'object' ? (body.subtitleStyle as { fontSize?: number; color?: string; position?: string; segment?: boolean; plate?: boolean; fontKind?: 'bold' | 'serif'; highlight?: boolean; highlightColor?: string; safeArea?: boolean }) : undefined,
          watermark: body.watermark === null ? null : (body.watermark && typeof body.watermark === 'object' ? (body.watermark as { text?: string; position?: string; opacity?: number }) : undefined),
          look: body.look === null ? null : (typeof body.look === 'string' ? body.look : undefined),
          progressBar: body.progressBar && typeof body.progressBar === 'object' ? (body.progressBar as { enabled?: boolean; color?: string; position?: string }) : undefined,
          sceneTitles: typeof body.sceneTitles === 'boolean' ? body.sceneTitles : undefined,
          autoSfx: typeof body.autoSfx === 'boolean' ? body.autoSfx : undefined,
          stockBroll: typeof body.stockBroll === 'boolean' ? body.stockBroll : undefined,
          bgmMood: body.bgmMood === null ? null : (typeof body.bgmMood === 'string' ? body.bgmMood : undefined),
          filmFinish: body.filmFinish && typeof body.filmFinish === 'object' ? (body.filmFinish as { enabled?: boolean; intensity?: string }) : undefined,
          watermarkLogo: body.watermarkLogo === null ? null : (body.watermarkLogo && typeof body.watermarkLogo === 'object' ? (body.watermarkLogo as { src?: string | null; position?: string; scale?: number }) : undefined),
        },
        buildActor(session, request),
        { bypassOwnership: bypass },
      ),
    );
  },
);

export const DELETE = withPermission(
  PERMISSIONS.STUDIO_DELETE,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_DELETE_ALL);
    return ApiResponse.json(await deleteProject(memberId, id, buildActor(session, request), { bypassOwnership: bypass }));
  },
);
