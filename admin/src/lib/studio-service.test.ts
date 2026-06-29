import { describe, it, expect, vi, beforeEach } from 'vitest';

// 驗證 updateProject 的輸入規則（在碰 DB 之前就擋下非法值）。
vi.mock('@/lib/prisma', () => ({
  prisma: { studioProject: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() } },
}));

import { updateProject, createProject } from './studio-service';
import { prisma } from '@/lib/prisma';
import { ApiReturnCode } from '@/lib/api-response';

/* eslint-disable @typescript-eslint/no-explicit-any */
beforeEach(() => vi.clearAllMocks());

describe('updateProject 輸入驗證（DB 之前）', () => {
  it('title 超過 120 字 → VALIDATION_ERROR 且不查 DB', async () => {
    const r = await updateProject('owner', 'p', { title: 'x'.repeat(121) });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
    expect(prisma.studioProject.findFirst).not.toHaveBeenCalled();
  });

  it('title 只有空白 → VALIDATION_ERROR', async () => {
    const r = await updateProject('owner', 'p', { title: '   ' });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
  });

  it('bgmGain > 1 → VALIDATION_ERROR 且不查 DB', async () => {
    const r = await updateProject('owner', 'p', { bgmGain: 1.5 });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
    expect(prisma.studioProject.findFirst).not.toHaveBeenCalled();
  });

  it('bgmGain < 0 → VALIDATION_ERROR', async () => {
    const r = await updateProject('owner', 'p', { bgmGain: -0.1 });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
  });

  it('renderQuality 非 standard/high → VALIDATION_ERROR', async () => {
    const r = await updateProject('owner', 'p', { renderQuality: '4k' as any });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
  });

  it('bgmGain 邊界 0 與 1 視為合法（通過驗證、進到 DB 查詢）', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue(null);
    const r0 = await updateProject('owner', 'p', { bgmGain: 0 });
    const r1 = await updateProject('owner', 'p', { bgmGain: 1 });
    expect(r0.code).not.toBe(ApiReturnCode.VALIDATION_ERROR);
    expect(r1.code).not.toBe(ApiReturnCode.VALIDATION_ERROR);
    expect(prisma.studioProject.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('createProject 標題驗證（DB 之前）', () => {
  it('空標題 → VALIDATION_ERROR 且不建立', async () => {
    const r = await createProject('owner', { title: '' });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
    expect(prisma.studioProject.create).not.toHaveBeenCalled();
  });

  it('只有空白的標題 → VALIDATION_ERROR', async () => {
    const r = await createProject('owner', { title: '   ' });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
    expect(prisma.studioProject.create).not.toHaveBeenCalled();
  });

  it('標題超過 120 字 → VALIDATION_ERROR', async () => {
    const r = await createProject('owner', { title: 'x'.repeat(121) });
    expect(r.code).toBe(ApiReturnCode.VALIDATION_ERROR);
    expect(prisma.studioProject.create).not.toHaveBeenCalled();
  });
});
