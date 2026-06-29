import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { createScene, createShot, getStoryboard, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { chatStoryboard, type ChatMessage } from '@/lib/studio/interview';
import { buildStoryContext } from '@/lib/studio/story-context';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// 多輪訪談：傳對話歷史，回下一個問題；資訊足夠時 AI 生分鏡並落 DB，回 { done:true, storyboard }
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { messages?: unknown };
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    const messages: ChatMessage[] = Array.isArray(body.messages)
      ? (body.messages as unknown[])
          .filter((m): m is { role?: unknown; content?: unknown } => !!m && typeof (m as { content?: unknown }).content === 'string')
          .map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: String(m.content) }))
      : [];
    if (!messages.length) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少對話訊息');

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const actor = buildActor(session, request);

    let result;
    try {
      result = await chatStoryboard(messages, await buildStoryContext(id));
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      const friendly = /api[\s_-]?key|anthropic|authentication|unauthor/i.test(raw)
        ? 'AI 訪談尚未啟用：未設定 ANTHROPIC_API_KEY，可改用「+ 新增分鏡」手動建立分鏡'
        : 'AI 對話失敗，請稍後再試' + (raw ? `：${raw}` : '');
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, friendly);
    }

    if (!result.done) return ApiResponse.ok({ done: false, reply: result.reply }, 'ok');

    const scene = await createScene(memberId, id, { title: 'AI 生成分鏡' }, actor, { bypassOwnership: bypass });
    if (scene.code !== ApiReturnCode.SUCCESS || !scene.data) return ApiResponse.json(scene);
    for (const ps of result.shots) {
      await createShot(
        memberId,
        {
          projectId: id, sceneId: scene.data.id, visual: ps.visual, tts: ps.tts, motion: ps.motion, emotion: ps.emotion, branch: ps.branch,
          caption: ps.caption, punchline: ps.punchline, sfx: ps.sfx === 'none' ? undefined : ps.sfx, punch: ps.punch,
          punchAtFrac: ps.punchAtFrac, punchZoom: ps.punchZoom,
        },
        actor,
        { bypassOwnership: bypass },
      );
    }
    const sb = await getStoryboard(memberId, id, { bypassOwnership: bypass });
    return ApiResponse.ok({ done: true, storyboard: sb.data, shotCount: result.shots.length }, '分鏡已生成');
  },
);
