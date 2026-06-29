import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiReturnCode } from '@/lib/api-response';

// 把 prisma 閘與 service 層 stub 掉，專門驗證 applyProposals 的「綁回 URL 專案」邏輯（R93/R96 安全修補）。
vi.mock('@/lib/prisma', () => ({
  prisma: { scene: { findFirst: vi.fn() }, shot: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/studio-service', () => ({
  updateStoryBible: vi.fn(),
  createScene: vi.fn(),
  updateScene: vi.fn(),
  createShot: vi.fn(),
  updateShot: vi.fn(),
  attachCharacterToProject: vi.fn(),
  assignCharacterToShot: vi.fn(),
}));

import { applyProposals } from './proposals';
import { prisma } from '@/lib/prisma';
import * as svc from '@/lib/studio-service';

/* eslint-disable @typescript-eslint/no-explicit-any */
const actor = { id: 'owner', email: null, name: null, ipAddress: null } as any;
const opts = { bypassOwnership: false };
const okResult = { code: ApiReturnCode.SUCCESS };

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [svc.updateStoryBible, svc.createScene, svc.updateScene, svc.createShot, svc.updateShot, svc.attachCharacterToProject, svc.assignCharacterToShot]) {
    vi.mocked(fn as any).mockResolvedValue(okResult);
  }
});

describe('applyProposals 專案綁定（R93/R96 安全修補）', () => {
  it('update_shot 的 shotId 屬於此專案 → 套用', async () => {
    vi.mocked(prisma.shot.findFirst as any).mockResolvedValue({ id: 's1' });
    const out = await applyProposals('owner', 'proj1', [{ kind: 'update_shot', summary: '改', shotId: 's1', tts: 'x' }] as any, actor, opts);
    expect(svc.updateShot).toHaveBeenCalledWith('owner', 's1', expect.objectContaining({ tts: 'x' }), actor, opts);
    expect(out.applied).toBe(1);
    expect(out.results[0].ok).toBe(true);
  });

  it('update_shot 的 shotId 不屬於此專案 → 拒絕、不呼叫 updateShot', async () => {
    vi.mocked(prisma.shot.findFirst as any).mockResolvedValue(null);
    const out = await applyProposals('owner', 'proj1', [{ kind: 'update_shot', summary: '改', shotId: 'other', tts: 'x' }] as any, actor, opts);
    expect(svc.updateShot).not.toHaveBeenCalled();
    expect(out.applied).toBe(0);
    expect(out.results[0].ok).toBe(false);
    expect(out.results[0].message).toContain('不屬於此專案');
  });

  it('update_shot 缺 shotId → 不查 DB、直接拒絕（R96）', async () => {
    const out = await applyProposals('owner', 'proj1', [{ kind: 'update_shot', summary: '改' }] as any, actor, opts);
    expect(prisma.shot.findFirst).not.toHaveBeenCalled();
    expect(svc.updateShot).not.toHaveBeenCalled();
    expect(out.results[0].ok).toBe(false);
  });

  it('update_scene 同樣綁定 projectId', async () => {
    vi.mocked(prisma.scene.findFirst as any).mockResolvedValue(null);
    const out = await applyProposals('owner', 'proj1', [{ kind: 'update_scene', summary: '改', sceneId: 'other', title: 'x' }] as any, actor, opts);
    expect(svc.updateScene).not.toHaveBeenCalled();
    expect(out.results[0].ok).toBe(false);
  });

  it('assign_character_to_shot 同樣綁定 projectId', async () => {
    vi.mocked(prisma.shot.findFirst as any).mockResolvedValue(null);
    const out = await applyProposals('owner', 'proj1', [{ kind: 'assign_character_to_shot', summary: '指派', shotId: 'other', characterId: 'c1' }] as any, actor, opts);
    expect(svc.assignCharacterToShot).not.toHaveBeenCalled();
    expect(out.results[0].ok).toBe(false);
  });

  it('create_shot 帶 projectId 直接呼叫（不經 findFirst 閘）', async () => {
    const out = await applyProposals('owner', 'proj1', [{ kind: 'create_shot', summary: '新', visual: 'a' }] as any, actor, opts);
    expect(svc.createShot).toHaveBeenCalledWith('owner', expect.objectContaining({ projectId: 'proj1', visual: 'a' }), actor, opts);
    expect(out.applied).toBe(1);
  });

  it('混合提案：合法者套用、越界者拒絕，applied 計數正確', async () => {
    vi.mocked(prisma.shot.findFirst as any).mockImplementation((args: any) => Promise.resolve(args?.where?.id === 's1' ? { id: 's1' } : null));
    const out = await applyProposals('owner', 'proj1', [
      { kind: 'update_shot', summary: 'ok', shotId: 's1', tts: 'a' },
      { kind: 'update_shot', summary: 'bad', shotId: 'other', tts: 'b' },
    ] as any, actor, opts);
    expect(out.applied).toBe(1);
    expect(out.results.map((r) => r.ok)).toEqual([true, false]);
  });
});
