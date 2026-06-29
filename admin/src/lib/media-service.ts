import type { Media } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';
import { deleteObject, getSignedReadUrl, type MediaKind } from '@/lib/media-storage';
import type { StudioActor, StudioOpOptions } from '@/lib/studio-service';

const ERR_DB = 'media.db_error';

export type MediaDto = Pick<
  Media,
  'id' | 'fileName' | 'mimeType' | 'kind' | 'size' | 'createdAt' | 'updatedAt'
> & {
  /** 即時簽的 inline presigned URL（給 <img>/<video>/<audio> 的 src），會過期 */
  url: string;
};

function ownerWhere(id: string, ownerId: string, options?: StudioOpOptions): { id: string; ownerId?: string } {
  return options?.bypassOwnership ? { id } : { id, ownerId };
}

async function mediaToDto(m: Media): Promise<MediaDto> {
  return {
    id: m.id,
    fileName: m.fileName,
    mimeType: m.mimeType,
    kind: m.kind,
    size: m.size,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    url: await getSignedReadUrl(m.key),
  };
}

/** 列出媒體（owner 隔離；all=true 由路由層 view_all 把關後跨 owner）。可選 kind 篩選。 */
export async function listMedia(
  ownerId: string,
  all = false,
  kind?: MediaKind,
): Promise<ApiResult<MediaDto[]>> {
  try {
    const rows = await prisma.media.findMany({
      where: { ...(all ? {} : { ownerId }), ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    const dtos = await Promise.all(rows.map((r) => mediaToDto(r)));
    return ApiResponse.success(dtos, '取得媒體列表成功');
  } catch (e) {
    console.error('[MediaService.listMedia]', { ownerId, all, kind }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入媒體失敗', ERR_DB);
  }
}

/** 上傳完成後寫一筆媒體記錄。 */
export async function createMediaRecord(
  input: { key: string; fileName: string; mimeType: string; kind: MediaKind; size: number; ownerId: string },
  actor?: StudioActor,
): Promise<ApiResult<MediaDto>> {
  try {
    const m = await prisma.media.create({ data: input });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Media', entityId: m.id, action: 'create',
      newValue: { fileName: m.fileName, kind: m.kind, size: m.size }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(await mediaToDto(m), '已上傳');
  } catch (e) {
    console.error('[MediaService.createMediaRecord]', { ownerId: input.ownerId, key: input.key }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立媒體記錄失敗', ERR_DB);
  }
}

/** 取單筆供下載（owner 把關、可被 view_all bypass）。回 key+fileName 供路由簽 attachment URL。 */
export async function getMediaForDownload(
  id: string,
  ownerId: string,
  options?: StudioOpOptions,
): Promise<ApiResult<{ key: string; fileName: string }>> {
  try {
    const m = await prisma.media.findFirst({ where: ownerWhere(id, ownerId, options) });
    if (!m) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此檔案', 'media.not_found');
    return ApiResponse.success({ key: m.key, fileName: m.fileName }, 'ok');
  } catch (e) {
    console.error('[MediaService.getMediaForDownload]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '讀取媒體失敗', ERR_DB);
  }
}

/** 刪除媒體：先刪 S3 物件（best-effort，不擋 DB），再刪 DB 記錄。 */
export async function deleteMedia(
  id: string,
  ownerId: string,
  actor?: StudioActor,
  options?: StudioOpOptions,
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.media.findFirst({ where: ownerWhere(id, ownerId, options) });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此檔案', 'media.not_found');
    try {
      await deleteObject(existing.key);
    } catch (e) {
      // S3 刪除失敗不擋 DB 刪除（避免孤兒記錄擋住使用者；物件可後續清理）
      console.error('[MediaService.deleteMedia] S3 物件刪除失敗（續刪 DB）', { key: existing.key }, e);
    }
    await prisma.media.delete({ where: { id } });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Media', entityId: id, action: 'delete',
      oldValue: { fileName: existing.fileName, key: existing.key }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success({ id }, '檔案已刪除');
  } catch (e) {
    console.error('[MediaService.deleteMedia]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除檔案失敗', ERR_DB);
  }
}
