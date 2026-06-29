import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { generateYouTubeMeta } from '@/lib/studio/youtube-meta';
import { providerConfigured, resolveProvider } from '@/lib/studio/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 產生 YouTube/抖音 上架包裝（標題/縮圖大字/說明/hashtags/置頂留言）。不落庫，回 { meta } 供前端複製。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    const provider = resolveProvider();
    if (!providerConfigured(provider)) {
      return ApiResponse.fail(
        ApiReturnCode.INTERNAL_ERROR,
        provider === 'vertex'
          ? 'Gemini Vertex 尚未設定（需 GOOGLE_VERTEX_PROJECT 與 GOOGLE_VERTEX_CREDENTIALS）'
          : 'AI 尚未啟用：未設定 ANTHROPIC_API_KEY',
      );
    }

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

    try {
      const meta = await generateYouTubeMeta(id);
      if (!meta.title && !meta.description) {
        return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生上架文案，請稍後再試');
      }
      return ApiResponse.ok({ meta }, '已產生 YouTube 上架文案');
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 產生上架文案失敗' + (raw ? `：${raw}` : ''));
    }
  },
);
