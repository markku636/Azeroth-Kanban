/**
 * Selkie service —— 觸發並追蹤 AI triage(AgentRun)。
 *
 * triage 可能耗時 1–3 分鐘:startTriage 立即建立 AgentRun(QUEUED)並回傳,
 * 實際調查在背景進行(standalone Next.js node server 中,回應送出後 promise 仍續跑),
 * 結果寫回 AgentRun。前端輪詢 agent-runs/[id] 取得進度。
 */
import type { AgentRun, AgentRunStatus } from '@prisma/client';
import { runTriage, type Incident as SelkieIncident } from '@azeroth/selkie';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';
import type { IncidentActor } from '@/lib/incident-service';
import { prisma } from '@/lib/prisma';

export interface AgentRunDto {
  id: string;
  incidentId: string;
  status: AgentRunStatus;
  finalSummary: string | null;
  reportMarkdown: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

function toDto(run: AgentRun): AgentRunDto {
  return {
    id: run.id,
    incidentId: run.incidentId,
    status: run.status,
    finalSummary: run.finalSummary,
    reportMarkdown: run.reportMarkdown,
    error: run.error,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
  };
}

/** 把底層錯誤(常被多層 cause 包住)轉成對值班工程師可讀的中文說明。 */
function describeTriageError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let depth = 0; cur instanceof Error && depth < 8; depth += 1) {
    if (cur.message) parts.push(cur.message);
    cur = (cur as Error & { cause?: unknown }).cause;
  }
  const blob = parts.join(' | ');
  if (/service-account\.json|GOOGLE_APPLICATION_CREDENTIALS|default credentials/i.test(blob)) {
    return 'Selkie 找不到 Vertex AI 的 service account 憑證。請確認 service-account.json 已放在專案根目錄並掛載進容器。';
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|too many requests|quota/i.test(blob)) {
    return 'Vertex AI Gemini 配額不足或速率超限(HTTP 429)。請啟用 GCP billing,或調高該專案的 Vertex AI 配額;亦可調低 GEMINI_MAX_CONCURRENCY。';
  }
  if (/reading 'message'/.test(blob)) {
    return 'Gemini 請求失敗(多半是配額 429,或該模型在此專案 / 區域不可用)。請確認 GCP 專案的 Vertex AI 配額充足。';
  }
  if (/\b404\b|NOT_FOUND|not found/i.test(blob)) {
    return `Gemini 模型不存在或在此區域不可用,請確認 GEMINI_MODEL。原始錯誤:${parts.at(-1) ?? blob}`;
  }
  return blob || (e instanceof Error ? e.message : String(e));
}

/**
 * 背景執行 triage,並把結果寫回 AgentRun。
 * 任何錯誤(含缺少 LLM 認證)都會被捕捉並標記為 FAILED。
 */
async function executeTriage(
  runId: string,
  threadId: string,
  incident: SelkieIncident,
): Promise<void> {
  try {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    const result = await runTriage(incident, { threadId });
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'SUCCEEDED',
        finalSummary: result.finalText || null,
        reportMarkdown: result.report,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    console.error('[SelkieService.executeTriage]', runId, e);
    await prisma.agentRun
      .update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          error: describeTriageError(e),
          finishedAt: new Date(),
        },
      })
      .catch(() => {
        /* 連寫入失敗都失敗時,只能放棄 */
      });
  }
}

/** 觸發一次 triage:建立 AgentRun(QUEUED)並於背景執行。 */
export async function startTriage(
  userId: string,
  incidentId: string,
  actor: IncidentActor,
  canViewAll: boolean,
): Promise<ApiResult<AgentRunDto>> {
  const incident = await prisma.incident.findFirst({
    where: canViewAll ? { id: incidentId } : { id: incidentId, ownerId: userId },
  });
  if (!incident) {
    return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到事故');
  }

  // 已有進行中的 run 就不重複觸發
  const inflight = await prisma.agentRun.findFirst({
    where: { incidentId, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (inflight) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, 'Selkie 正在調查此事故,請稍候');
  }

  const threadId = `selkie-${incidentId}-${Date.now()}`;
  const run = await prisma.agentRun.create({
    data: { incidentId, status: 'QUEUED', threadId, createdById: userId },
  });
  await createAuditLog({
    actorId: actor.id,
    actorEmail: actor.email ?? undefined,
    actorName: actor.name ?? undefined,
    entityType: 'AgentRun',
    entityId: run.id,
    action: 'create',
    newValue: { incidentId, incidentCode: incident.code },
    ipAddress: actor.ipAddress,
  });

  // 把 DB Incident 映射成 selkie 的 Incident,完整帶入(agent 不需再查後端)
  const selkieIncident: SelkieIncident = {
    id: incident.code,
    title: incident.title,
    service: incident.service,
    source: incident.source,
    status: incident.status.toLowerCase(),
    triggeredAt: incident.triggeredAt.toISOString(),
    description: incident.description ?? incident.title,
    severityHint: incident.severity ?? undefined,
  };

  // 背景執行(刻意不 await)
  void executeTriage(run.id, threadId, selkieIncident);

  return ApiResponse.success(toDto(run), 'Selkie 已開始調查');
}

/** 取得單一 AgentRun(供前端輪詢)。 */
export async function getAgentRun(id: string): Promise<ApiResult<AgentRunDto>> {
  try {
    const run = await prisma.agentRun.findUnique({ where: { id } });
    if (!run) {
      return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到調查紀錄');
    }
    return ApiResponse.success(toDto(run), '取得調查紀錄成功');
  } catch (e) {
    console.error('[SelkieService.getAgentRun]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入調查紀錄失敗');
  }
}

/** 取得某事故最新一次 AgentRun(沒有則回 null)。 */
export async function getLatestRun(incidentId: string): Promise<ApiResult<AgentRunDto | null>> {
  try {
    const run = await prisma.agentRun.findFirst({
      where: { incidentId },
      orderBy: { createdAt: 'desc' },
    });
    return ApiResponse.success(run ? toDto(run) : null, 'OK');
  } catch (e) {
    console.error('[SelkieService.getLatestRun]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入調查紀錄失敗');
  }
}
