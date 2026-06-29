import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({ existsSync: vi.fn(), statSync: vi.fn() }));

import { existsSync, statSync } from 'node:fs';
import { shotHasClip, projectOutputInfo, shotClipFile } from './storage';

/* eslint-disable @typescript-eslint/no-explicit-any */
beforeEach(() => vi.clearAllMocks());

describe('shotHasClip', () => {
  it('DB 路徑存在 → true（優先採用 lip/i2v 絕對路徑）', () => {
    vi.mocked(existsSync as any).mockImplementation((p: string) => p === '/abs/lip.mp4');
    expect(shotHasClip('proj', 'shot', ['/abs/lip.mp4'])).toBe(true);
    expect(existsSync).toHaveBeenCalledWith('/abs/lip.mp4');
  });

  it('DB 路徑皆空 → 退回 studio_storage 慣例路徑', () => {
    const conv = shotClipFile('proj', 'shot');
    vi.mocked(existsSync as any).mockImplementation((p: string) => p === conv);
    expect(shotHasClip('proj', 'shot', [null, undefined])).toBe(true);
  });

  it('都不存在 → false', () => {
    vi.mocked(existsSync as any).mockReturnValue(false);
    expect(shotHasClip('proj', 'shot', ['/nope.mp4'])).toBe(false);
  });

  it('fs 例外 → 安全回退 false', () => {
    vi.mocked(existsSync as any).mockImplementation(() => { throw new Error('EIO'); });
    expect(shotHasClip('proj', 'shot')).toBe(false);
  });
});

describe('projectOutputInfo', () => {
  it('成片存在 → hasOutput + ISO mtime', () => {
    vi.mocked(existsSync as any).mockReturnValue(true);
    vi.mocked(statSync as any).mockReturnValue({ mtime: new Date('2026-06-30T12:00:00.000Z') });
    expect(projectOutputInfo('proj')).toEqual({ hasOutput: true, outputUpdatedAt: '2026-06-30T12:00:00.000Z' });
  });

  it('成片不存在 → hasOutput false', () => {
    vi.mocked(existsSync as any).mockReturnValue(false);
    expect(projectOutputInfo('proj')).toEqual({ hasOutput: false, outputUpdatedAt: null });
  });

  it('statSync 例外 → 安全回退', () => {
    vi.mocked(existsSync as any).mockReturnValue(true);
    vi.mocked(statSync as any).mockImplementation(() => { throw new Error('EIO'); });
    expect(projectOutputInfo('proj')).toEqual({ hasOutput: false, outputUpdatedAt: null });
  });
});
