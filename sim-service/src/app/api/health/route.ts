import { getMode } from '@/lib/chaos';

export const dynamic = 'force-dynamic';

/** GET /api/health —— 健康檢查。 */
export function GET() {
  return Response.json({
    status: 'ok',
    service: process.env.SERVICE_NAME ?? 'sim-service',
    chaos: getMode(),
  });
}
