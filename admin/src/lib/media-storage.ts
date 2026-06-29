/**
 * 媒體庫 S3/MinIO 物件儲存層（server-only）。
 *
 * 與既有 `lib/studio/storage.ts`（本機磁碟、studio 影片產物）刻意分開：
 * 此模組只負責媒體庫上傳到 S3 相容物件儲存（MinIO）並以 presigned URL 私密讀取。
 *
 * 私密模式：bucket 不開匿名讀；清單/預覽/下載一律由後端即時簽限時 URL。
 * 簽名用的 endpoint 必須是「瀏覽器可達」的 public 位址（S3_PUBLIC_URL），
 * 否則簽出來的 URL host 會是叢集內部 svc，前端連不到。
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extname } from 'node:path';

export const S3_BUCKET = process.env.S3_BUCKET ?? 'studio-media';
const S3_REGION = process.env.S3_REGION ?? 'us-east-1';
// 後端打 MinIO 用的位址；私密模式下與 PUBLIC_URL 同（presigned 需用瀏覽器可達 host 簽）
const S3_ENDPOINT = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? '';
const SIGNED_URL_TTL = 3600; // presigned URL 有效秒數（1h）

// dev HMR 下重複 import 不重建 client（比照 lib/prisma.ts 的 globalThis 單例）
const globalForS3 = globalThis as unknown as { mediaS3Client?: S3Client };

function client(): S3Client {
  if (!globalForS3.mediaS3Client) {
    globalForS3.mediaS3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      forcePathStyle: true, // MinIO 必須
    });
  }
  return globalForS3.mediaS3Client;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/** 由 MIME type 推導媒體種類（前端用不同方式渲染） */
export function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export interface UploadResult {
  key: string;
  size: number;
  mimeType: string;
}

/** 上傳到 S3，key = YYYY/MM/<uuid><ext>。回傳 key/size/mime（公開 URL 不寫 DB，讀取一律即時簽）。 */
export async function uploadObject(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<UploadResult> {
  const ext = extname(originalName).toLowerCase();
  const now = new Date();
  const key = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;

  await client().send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType }),
  );

  return { key, size: buffer.length, mimeType };
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

/**
 * 簽一個限時可讀的 presigned URL。
 * - 預設 inline（給 <img>/<video>/<audio> 的 src 用）。
 * - download=true 時帶 Content-Disposition: attachment，瀏覽器以原始檔名下載。
 */
export async function getSignedReadUrl(
  key: string,
  opts?: { download?: boolean; fileName?: string },
): Promise<string> {
  const name = opts?.fileName ?? key.split('/').pop() ?? 'download';
  // RFC 5987 嚴格編碼：encodeURIComponent 不會編 ' ( ) * !（這些在 ext-value 文法非法／與分隔符撞），補上；
  // 另給 ASCII filename="" fallback 提升相容性（含中文時 filename* 才是正解）。
  const enc = encodeURIComponent(name).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const cmd = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ...(opts?.download ? { ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${enc}` } : {}),
  });
  return getSignedUrl(client(), cmd, { expiresIn: SIGNED_URL_TTL });
}
