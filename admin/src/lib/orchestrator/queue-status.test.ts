import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 鎖住佇列狀態的「跨租戶遮蔽」：他人專案不得露出標題/深連結（5th review 驗證過的安全行為）。
const { getCurrentProgress, q } = vi.hoisted(() => ({
  getCurrentProgress: vi.fn(),
  q: { getActive: vi.fn(), getWaiting: vi.fn(), getDelayed: vi.fn(), getJobCounts: vi.fn(), getJob: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { studioProject: { findMany: vi.fn() }, shot: { findMany: vi.fn() } } }));
vi.mock('./queue', () => ({ pipelineQueue: q }));
vi.mock('./events', () => ({ getCurrentProgress }));

import { getQueueStatus } from './queue-status';
import { prisma } from '@/lib/prisma';

/* eslint-disable @typescript-eslint/no-explicit-any */
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no comfy'))));
  getCurrentProgress.mockResolvedValue(null);
  q.getActive.mockResolvedValue([{ id: 'j1', data: { projectId: 'mine', mode: 'render', shotIds: [] }, timestamp: 1, processedOn: 2 }]);
  q.getWaiting.mockResolvedValue([{ id: 'j2', data: { projectId: 'others', mode: 'keyframes', shotIds: [] }, timestamp: 3 }]);
  q.getDelayed.mockResolvedValue([]);
  q.getJobCounts.mockResolvedValue({ active: 1, waiting: 1, delayed: 0, completed: 0, failed: 0 });
  vi.mocked(prisma.studioProject.findMany as any).mockResolvedValue([
    { id: 'mine', title: '我的片', ownerId: 'me' },
    { id: 'others', title: '別人的片', ownerId: 'someoneelse' },
  ]);
});
afterEach(() => vi.unstubAllGlobals());

describe('getQueueStatus 跨租戶遮蔽', () => {
  it('一般使用者：本人專案露標題/連結，他人專案被遮蔽（無標題、無 projectId）', async () => {
    const s = await getQueueStatus({ memberId: 'me', viewAll: false });
    expect(s.active[0]).toMatchObject({ owned: true, projectTitle: '我的片', projectId: 'mine' });
    expect(s.waiting[0]).toMatchObject({ owned: false, projectTitle: '其他使用者的專案', projectId: '' });
  });

  it('viewAll（EDIT_ALL）：他人專案也可見', async () => {
    const s = await getQueueStatus({ memberId: 'me', viewAll: true });
    expect(s.waiting[0]).toMatchObject({ owned: true, projectTitle: '別人的片', projectId: 'others' });
  });

  it('Redis 例外 → degraded 閒置狀態（不丟 500）', async () => {
    q.getActive.mockRejectedValue(new Error('redis down'));
    const s = await getQueueStatus({ memberId: 'me', viewAll: false });
    expect(s.degraded).toBe(true);
    expect(s.active).toEqual([]);
    expect(s.waiting).toEqual([]);
  });
});
