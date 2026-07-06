import { describe, it, expect, vi, beforeEach } from 'vitest';

// 驗證 updateProject 的輸入規則（在碰 DB 之前就擋下非法值）。
vi.mock('@/lib/prisma', () => ({
  prisma: { studioProject: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() } },
}));
vi.mock('@/lib/audit-log-service', () => ({ createAuditLog: vi.fn() }));

import { updateProject, createProject, parseWatermark, parseProgressBar, parseFilmFinish } from './studio-service';
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

describe('parseWatermark（spec → 浮水印設定）', () => {
  it('合法 → 正規化：trim text、position 非法退 tr、opacity 夾 0.15~1', () => {
    expect(parseWatermark({ watermark: { text: '  @me  ', position: 'zz', opacity: 9 } })).toEqual({ text: '@me', position: 'tr', opacity: 1 });
    expect(parseWatermark({ watermark: { text: '@x', position: 'bl', opacity: 0 } })).toEqual({ text: '@x', position: 'bl', opacity: 0.15 });
  });
  it('空 text / 無 watermark / null → null', () => {
    expect(parseWatermark({ watermark: { text: '   ' } })).toBeNull();
    expect(parseWatermark({})).toBeNull();
    expect(parseWatermark(null)).toBeNull();
  });
});

describe('updateProject 浮水印合併進 spec', () => {
  it('設定：保留 spec 其他鍵、trim text、clamp opacity、驗證 position', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1 } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { watermark: { text: '  @me  ', position: 'bl', opacity: 9 } });
    const data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).watermark).toEqual({ text: '@me', position: 'bl', opacity: 1 });
  });
  it('null → 移除 spec.watermark，保留其他鍵', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1, watermark: { text: '@x' } } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { watermark: null });
    const data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).watermark).toBeUndefined();
  });
  it('look 與 watermark 同時 patch → 一次合併、互不覆蓋、保留其他鍵', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1 } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { look: 'cyber', watermark: { text: '@me' } });
    const data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).look).toBe('cyber');
    expect((data.spec as any).watermark.text).toBe('@me');
  });
  it('look=null → 移除 spec.look', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1, look: 'mono' } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { look: null });
    const data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).look).toBeUndefined();
  });
  it('progressBar enabled → 存 spec.progressBar（驗色）；同時 patch look 不互相覆蓋', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1 } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { look: 'film', progressBar: { enabled: true, color: '#FF0000', position: 'top' } });
    const data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).look).toBe('film');
    expect((data.spec as any).progressBar).toEqual({ enabled: true, color: '#FF0000', position: 'top' });
  });
  it('progressBar enabled=false → 移除 spec.progressBar', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1, progressBar: { enabled: true } } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { progressBar: { enabled: false } });
    const data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).progressBar).toBeUndefined();
  });
  it('sceneTitles true 存 / false 移除，與 progressBar 同批不衝突', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1 } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { sceneTitles: true, progressBar: { enabled: true } });
    let data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).sceneTitles).toBe(true);
    expect((data.spec as any).progressBar.enabled).toBe(true);
    vi.clearAllMocks();
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1, sceneTitles: true } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { sceneTitles: false });
    data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).sceneTitles).toBeUndefined();
  });
  it('filmFinish enabled 存(驗 intensity)/false 移除', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1 } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { filmFinish: { enabled: true, intensity: 'weird' } });
    let data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).filmFinish).toEqual({ enabled: true, intensity: 'subtle' }); // 非法 intensity → subtle
    vi.clearAllMocks();
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1, filmFinish: { enabled: true } } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { filmFinish: { enabled: false } });
    data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).filmFinish).toBeUndefined();
  });
  it('parseFilmFinish：未設→false/subtle；strong 帶出', () => {
    expect(parseFilmFinish({})).toEqual({ enabled: false, intensity: 'subtle' });
    expect(parseFilmFinish({ filmFinish: { enabled: true, intensity: 'strong' } })).toEqual({ enabled: true, intensity: 'strong' });
  });
  it('bgmMood 字串存 / null 移除，保留其他鍵', async () => {
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1 } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { bgmMood: 'epic' });
    let data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).bgmMood).toBe('epic');
    vi.clearAllMocks();
    vi.mocked(prisma.studioProject.findFirst as any).mockResolvedValue({ id: 'p', title: 't', spec: { keep: 1, bgmMood: 'epic' } });
    vi.mocked(prisma.studioProject.update as any).mockResolvedValue({ id: 'p', title: 't', spec: {} });
    await updateProject('owner', 'p', { bgmMood: null });
    data = (vi.mocked(prisma.studioProject.update as any).mock.calls[0][0] as any).data;
    expect((data.spec as any).keep).toBe(1);
    expect((data.spec as any).bgmMood).toBeUndefined();
  });
});

describe('parseProgressBar（spec → 進度條設定）', () => {
  it('未設 → enabled:false + 預設金/底部', () => {
    expect(parseProgressBar({})).toEqual({ enabled: false, color: '#FFD400', position: 'bottom' });
    expect(parseProgressBar(null)).toEqual({ enabled: false, color: '#FFD400', position: 'bottom' });
  });
  it('合法 → 帶出 enabled/color/position；非法色退預設', () => {
    expect(parseProgressBar({ progressBar: { enabled: true, color: '#00FF00', position: 'top' } })).toEqual({ enabled: true, color: '#00FF00', position: 'top' });
    expect(parseProgressBar({ progressBar: { enabled: true, color: 'evil;x', position: 'x' } })).toEqual({ enabled: true, color: '#FFD400', position: 'bottom' });
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

  it('新專案預設 Pop-on 逐句字幕 + 底板 + 1080p 高品質（短影音最佳預設）', async () => {
    const now = new Date();
    vi.mocked(prisma.studioProject.create as any).mockResolvedValue({
      id: 'p1', title: '片', description: null, logline: null, status: 'interview',
      aspect: '9:16', fps: 30, renderQuality: 'high', bgmPath: null, bgmGain: null,
      subtitleStyle: { segment: true, plate: true }, createdAt: now, updatedAt: now,
    });
    const r = await createProject('owner', { title: '片' });
    expect(r.code).toBe(0);
    const arg = vi.mocked(prisma.studioProject.create as any).mock.calls[0][0];
    expect(arg.data.subtitleStyle).toEqual({ segment: true, plate: true });
    expect(arg.data.renderQuality).toBe('high');
  });
});
