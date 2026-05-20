import { burnCpu, getMode, leakMemory, leakedBytes, rssMb, sleep } from '@/lib/chaos';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** GET /api/work —— 模擬一次業務請求,並套用當前的故障模式。 */
export async function GET() {
  const start = Date.now();
  const mode = getMode();

  // crash:記錄致命錯誤後讓程序退出(容器 restart → crashloop)
  if (mode === 'crash') {
    log('ERROR', 'FATAL: simulated unrecoverable error — process exiting (code 1)', {
      route: '/api/work',
      chaos: mode,
      status: 500,
    });
    setTimeout(() => process.exit(1), 50);
    return new Response('crashing', { status: 500 });
  }

  if (mode === 'memory-leak') leakMemory(1000);
  if (mode === 'cpu-spin') burnCpu(600);
  if (mode === 'slow') await sleep(3000 + Math.floor(Math.random() * 5000));

  const failed = mode === 'error-5xx';
  const durationMs = Date.now() - start;
  const status = failed ? 500 : 200;

  const fields: Record<string, unknown> = { route: '/api/work', status, durationMs, chaos: mode };
  if (mode === 'memory-leak') {
    fields.rssMb = rssMb();
    fields.leakMb = Math.round(leakedBytes() / 1_048_576);
  }

  if (failed) {
    log('ERROR', 'request handler failed: Internal Server Error (HTTP 500)', fields);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
  if (mode === 'slow') {
    log('WARN', `slow request: ${durationMs}ms — service degraded`, fields);
  } else {
    log('INFO', 'request completed ok', fields);
  }
  return Response.json({ ok: true, service: process.env.SERVICE_NAME ?? 'sim-service' });
}
