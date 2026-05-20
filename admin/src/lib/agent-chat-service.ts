/**
 * Selkie 對話 service —— 事故詳情頁「追問 Selkie」面板的後端。
 *
 * triage 完成後,使用者可在事故上繼續追問。追問透過該事故最新一次成功
 * AgentRun 的 threadId,呼叫 selkie 的 continueTriage 沿用 LangGraph checkpointer
 * 記憶。對話訊息(使用者問句 + Selkie 回覆)持久化於 AgentMessage,重新整理仍可見。
 */
import type { AgentMessage } from '@prisma/client';
import { continueTriage } from '@azeroth/selkie';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export interface AgentMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: Date;
}

function toDto(m: AgentMessage): AgentMessageDto {
  return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt };
}

/** 確認事故對該使用者可見;回傳事故 id 或 null。 */
async function findVisibleIncident(
  userId: string,
  incidentId: string,
  canViewAll: boolean,
): Promise<{ id: string } | null> {
  return prisma.incident.findFirst({
    where: canViewAll ? { id: incidentId } : { id: incidentId, ownerId: userId },
    select: { id: true },
  });
}

/** 列出某事故的對話訊息(依時間排序)。 */
export async function listAgentMessages(
  userId: string,
  incidentId: string,
  canViewAll: boolean,
): Promise<ApiResult<AgentMessageDto[]>> {
  try {
    const incident = await findVisibleIncident(userId, incidentId, canViewAll);
    if (!incident) {
      return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到事故');
    }
    const rows = await prisma.agentMessage.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'asc' },
    });
    return ApiResponse.success(rows.map(toDto), 'OK');
  } catch (e) {
    console.error('[AgentChatService.listAgentMessages]', e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入對話失敗');
  }
}

/** 送出一則追問,呼叫 Selkie 並回傳其回覆。 */
export async function sendAgentMessage(
  userId: string,
  incidentId: string,
  content: string,
  canViewAll: boolean,
): Promise<ApiResult<{ reply: AgentMessageDto }>> {
  const text = content.trim();
  if (!text) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '訊息不可為空');
  }
  if (text.length > 2000) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '訊息過長(上限 2000 字)');
  }

  const incident = await findVisibleIncident(userId, incidentId, canViewAll);
  if (!incident) {
    return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到事故');
  }

  // 追問需要一次成功的 triage —— 其 threadId 帶有完整調查脈絡,對話才接得上。
  const run = await prisma.agentRun.findFirst({
    where: { incidentId, status: 'SUCCEEDED' },
    orderBy: { createdAt: 'desc' },
  });
  if (!run) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '請先讓 Selkie 完成一次調查,才能追問',
    );
  }

  // 先存使用者問句(即使後續 Selkie 失敗,問句仍保留在對話中)
  await prisma.agentMessage.create({
    data: { incidentId, role: 'USER', content: text, createdById: userId },
  });

  // 呼叫 Selkie;失敗時把錯誤訊息存成 Selkie 回覆,使對話保持完整可讀。
  let replyText: string;
  try {
    const out = await continueTriage(run.threadId, text);
    replyText = out?.trim() || '(Selkie 沒有回覆內容)';
  } catch (e) {
    console.error('[AgentChatService.continueTriage]', e);
    const msg = e instanceof Error ? e.message : String(e);
    replyText = `⚠️ Selkie 回覆失敗:${msg}`;
  }

  const saved = await prisma.agentMessage.create({
    data: { incidentId, role: 'ASSISTANT', content: replyText },
  });
  return ApiResponse.success({ reply: toDto(saved) }, 'OK');
}
