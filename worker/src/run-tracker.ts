/** AnalysisRun 追蹤 helper（對應 BullMQ job 狀態落庫）。 */
import { prisma } from './db.js';

export async function startRun(
  type: string,
  jobId: string | undefined,
  symbol: string | undefined,
  input: unknown,
): Promise<string> {
  const run = await prisma.analysisRun.create({
    data: {
      type,
      jobId: jobId ?? null,
      symbol: symbol ?? null,
      status: 'RUNNING',
      input: input as object,
    },
  });
  return run.id;
}

export async function finishRun(id: string, output: unknown): Promise<void> {
  await prisma.analysisRun.update({
    where: { id },
    data: { status: 'DONE', output: output as object },
  });
}

export async function failRun(id: string, error: string): Promise<void> {
  await prisma.analysisRun.update({
    where: { id },
    data: { status: 'FAILED', error },
  });
}
