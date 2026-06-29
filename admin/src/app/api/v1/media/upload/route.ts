import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { extname } from 'node:path';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { uploadObject, kindFromMime, deleteObject } from '@/lib/media-storage';
import { createMediaRecord } from '@/lib/media-service';
import type { StudioActor } from '@/lib/studio-service';

// 注意：request.formData() 會把整個 multipart body 讀進記憶體（100MB/檔）。
// 大量大檔並發上傳的真正解法是「瀏覽器直傳（presigned PUT）」讓後端完全不經手檔案——
// 列在未來範圍；目前內部工具、客戶端逐檔上傳，緩衝可接受。
export const runtime = 'nodejs';

const MAX_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_NAME = 255; // 對齊 Media.fileName VarChar(255)
const MAX_MIME = 150; // 對齊 Media.mimeType VarChar(150)

/** 截斷過長檔名但保留副檔名（避免超過 DB 欄長導致 insert 崩→孤兒物件）。 */
function clampFileName(name: string): string {
  if (name.length <= MAX_NAME) return name;
  const ext = extname(name);
  return name.slice(0, Math.max(0, MAX_NAME - ext.length)) + ext;
}

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

function isAllowed(mime: string): boolean {
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime === 'application/pdf'
  );
}

// 上傳檔案到媒體庫（MinIO/S3）。multipart：file=檔案。
export const POST = withPermission(PERMISSIONS.MEDIA_CREATE, async (request: NextRequest) => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '需以 multipart 上傳檔案');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少檔案');

  const mime = (file.type || 'application/octet-stream').slice(0, MAX_MIME);
  if (!isAllowed(mime)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '僅支援圖片 / 影片 / 音檔 / PDF');
  if (file.size === 0) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '檔案是空的');
  if (file.size > MAX_BYTES) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '檔案不可超過 100MB');

  const fileName = clampFileName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await uploadObject(buffer, fileName, mime);

  const result = await createMediaRecord(
    { key: up.key, fileName, mimeType: mime, kind: kindFromMime(mime), size: up.size, ownerId: memberId },
    buildActor(session, request),
  );
  // 落庫失敗（含 DB 例外）→ 清掉剛上傳但無 DB 記錄的孤兒物件（best-effort）
  if (result.code !== ApiReturnCode.SUCCESS) {
    try {
      await deleteObject(up.key);
    } catch (e) {
      console.error('[media.upload] 清理孤兒物件失敗', up.key, e);
    }
  }
  return ApiResponse.json(result);
});
