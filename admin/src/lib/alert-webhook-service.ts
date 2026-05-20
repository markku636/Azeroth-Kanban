/**
 * 告警 webhook service —— 接收外部監控/告警系統的 webhook。
 *
 * 流程:正規化告警 payload(normalizeAlert)→ 建立 Incident → 自動觸發 Selkie triage。
 * 由公開端點 /api/v1/webhooks/alerts/[source] 呼叫;webhook 沒有登入使用者,
 * 故事故 owner 指派給預設管理員(admin@example.com,缺少時取第一位啟用中的成員)。
 */
import { normalizeAlert } from '@azeroth/selkie';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createIncident, type IncidentActor, type IncidentDto } from '@/lib/incident-service';
import { prisma } from '@/lib/prisma';
import { startTriage } from '@/lib/selkie-service';

export interface AlertIngestResult {
  incident: IncidentDto;
  /** 是否成功觸發 Selkie 自動調查 */
  triageStarted: boolean;
}

type Severity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

/** 把各來源的嚴重度字樣對應到 IncidentSeverity(SEV1–SEV4)。 */
export function mapSeverity(hint: string | undefined): Severity {
  const s = (hint ?? '').toLowerCase().trim();
  if (['critical', 'sev1', 'p1', 'fatal', 'urgent', 'emergency'].includes(s)) return 'SEV1';
  if (['high', 'sev2', 'p2', 'error', 'major'].includes(s)) return 'SEV2';
  if (['medium', 'moderate', 'warning', 'warn', 'sev3', 'p3'].includes(s)) return 'SEV3';
  if (['low', 'info', 'minor', 'sev4', 'p4'].includes(s)) return 'SEV4';
  return 'SEV3';
}

/** 取系統預設負責人(優先 admin@example.com,否則第一位啟用中的成員)。供 webhook 與監控引擎共用。 */
export async function findDefaultOwner() {
  const admin = await prisma.member.findUnique({ where: { email: 'admin@example.com' } });
  if (admin?.isActive) return admin;
  return prisma.member.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** 接收一筆告警:正規化 → 建立事故 → 觸發 Selkie 自動 triage。 */
export async function ingestAlert(
  source: string,
  payload: unknown,
  ipAddress?: string,
): Promise<ApiResult<AlertIngestResult>> {
  let alert: ReturnType<typeof normalizeAlert>;
  try {
    alert = normalizeAlert(source, payload);
  } catch (e) {
    console.error('[AlertWebhookService.normalize]', e);
    return ApiResponse.error<AlertIngestResult>(
      ApiReturnCode.VALIDATION_ERROR,
      '無法解析告警內容',
    );
  }

  const owner = await findDefaultOwner();
  if (!owner) {
    return ApiResponse.error<AlertIngestResult>(
      ApiReturnCode.INTERNAL_ERROR,
      '系統尚無可指派的事故負責人',
    );
  }

  const actor: IncidentActor = {
    id: owner.id,
    email: owner.email,
    name: 'Selkie 告警 webhook',
    ipAddress,
  };

  const created = await createIncident(
    owner.id,
    {
      title: alert.title,
      service: alert.service,
      description: alert.description,
      severity: mapSeverity(alert.severityHint),
      source: source.trim() || alert.source || 'webhook',
    },
    actor,
  );
  if (!created.success || !created.data) {
    return ApiResponse.error<AlertIngestResult>(
      created.code,
      created.message || '建立事故失敗',
    );
  }

  // 自動觸發 triage —— 失敗不影響事故建立(事故仍會出現在看板上)。
  let triageStarted = false;
  try {
    const triage = await startTriage(owner.id, created.data.id, actor, true);
    triageStarted = triage.success;
    if (!triage.success) {
      console.warn('[AlertWebhookService.startTriage]', triage.message);
    }
  } catch (e) {
    console.error('[AlertWebhookService.startTriage]', e);
  }

  return ApiResponse.success<AlertIngestResult>(
    { incident: created.data, triageStarted },
    triageStarted ? '事故已建立,Selkie 已開始調查' : '事故已建立',
  );
}
