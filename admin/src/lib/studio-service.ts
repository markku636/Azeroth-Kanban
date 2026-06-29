import type { Character, Member, Prisma, ProjectCharacter, Scene, Shot, ShotStatus, StudioProject } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';
import { projectOutputInfo, sceneOutputInfo, shotHasClip, projectDir } from '@/lib/studio/storage';
import { rm } from 'node:fs/promises';

// 分鏡看板與 kanban 同演算法：scene = 欄，shot = 卡；sortOrder 走 SORT_GAP 分數插入 + normalize。
const SORT_GAP = 1000;
const NORMALIZE_THRESHOLD = 2;

export interface StudioActor {
  id: string;
  email: string | null;
  name: string | null;
  ipAddress?: string;
}

/** bypassOwnership=true 時跳過 ownerId 過濾（路由層已驗證 view_all/edit_all） */
export interface StudioOpOptions {
  bypassOwnership?: boolean;
}

export type ProjectDto = Pick<
  StudioProject,
  'id' | 'title' | 'description' | 'logline' | 'status' | 'aspect' | 'fps' | 'renderQuality' | 'bgmPath' | 'bgmGain' | 'subtitleStyle' | 'createdAt' | 'updatedAt'
> & {
  /** 是否已有成片 final.mp4（讓前端在 reload 後仍能預覽，並在列表標示「已完成」） */
  hasOutput: boolean;
  /** 成片最後產生時間（ISO），無成片時為 null */
  outputUpdatedAt: string | null;
  /** 分鏡數，僅列表查詢會帶 */
  shotCount?: number;
  /** 封面用：第一個有關鍵幀的分鏡（給尚無成片的進行中專案顯示縮圖）；僅列表查詢會帶 */
  coverShotId?: string;
  coverUpdatedAt?: string | null;
};

export type ShotDto = Pick<
  Shot,
  | 'id' | 'projectId' | 'sceneId' | 'shotNo' | 'sortOrder' | 'role' | 'speaker' | 'subtitle'
  | 'tts' | 'visual' | 'motion' | 'emotion' | 'branch' | 'status'
  | 'caption' | 'punchline' | 'sfx' | 'punch' | 'punchAtFrac' | 'punchZoom'
  | 'keyframePath' | 'refImage' | 'keyframeMode' | 'voiceWav' | 'lipsyncMp4' | 'i2vMp4' | 'characterId' | 'createdAt' | 'updatedAt'
> & {
  /** 此分鏡是否已有可播放的單鏡影片 clip（供卡片上的 ▶ 預覽） */
  hasClip: boolean;
};

export type SceneDto = Pick<Scene, 'id' | 'projectId' | 'title' | 'synopsis' | 'dialogue' | 'sortOrder'> & {
  shots: ShotDto[];
  /** 此幕是否已有單獨成片（scenes/<id>/final.mp4），供「本幕預覽」 */
  hasOutput: boolean;
  outputUpdatedAt: string | null;
};
export interface StoryboardDto {
  project: ProjectDto;
  scenes: SceneDto[];
}

const ERR_DB = 'studio.db_error';

function projectToDto(
  p: StudioProject,
  extra?: { shotCount?: number; cover?: { id: string; updatedAt: Date } | null },
): ProjectDto {
  const out = projectOutputInfo(p.id);
  return {
    id: p.id, title: p.title, description: p.description, logline: p.logline, status: p.status,
    aspect: p.aspect, fps: p.fps, renderQuality: p.renderQuality, bgmPath: p.bgmPath, bgmGain: p.bgmGain, subtitleStyle: p.subtitleStyle,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    hasOutput: out.hasOutput, outputUpdatedAt: out.outputUpdatedAt,
    ...(extra?.shotCount != null ? { shotCount: extra.shotCount } : {}),
    ...(extra?.cover ? { coverShotId: extra.cover.id, coverUpdatedAt: extra.cover.updatedAt.toISOString() } : {}),
  };
}

function sceneToDto(sc: Scene, shots: ShotDto[]): SceneDto {
  const out = sceneOutputInfo(sc.projectId, sc.id);
  return {
    id: sc.id, projectId: sc.projectId, title: sc.title, synopsis: sc.synopsis, dialogue: sc.dialogue,
    sortOrder: sc.sortOrder, shots, hasOutput: out.hasOutput, outputUpdatedAt: out.outputUpdatedAt,
  };
}

function shotToDto(s: Shot, hasClip = false): ShotDto {
  return {
    id: s.id, projectId: s.projectId, sceneId: s.sceneId, shotNo: s.shotNo, sortOrder: s.sortOrder,
    role: s.role, speaker: s.speaker, subtitle: s.subtitle, tts: s.tts, visual: s.visual,
    motion: s.motion, emotion: s.emotion, branch: s.branch, status: s.status,
    caption: s.caption, punchline: s.punchline, sfx: s.sfx, punch: s.punch, punchAtFrac: s.punchAtFrac, punchZoom: s.punchZoom,
    keyframePath: s.keyframePath, refImage: s.refImage, keyframeMode: s.keyframeMode,
    voiceWav: s.voiceWav, lipsyncMp4: s.lipsyncMp4, i2vMp4: s.i2vMp4, characterId: s.characterId,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
    hasClip,
  };
}

function ownerWhere<T extends { id: string; ownerId?: string }>(
  id: string, ownerId: string, options?: StudioOpOptions,
): { id: string; ownerId?: string } {
  return options?.bypassOwnership ? { id } : { id, ownerId };
}

// ─────────────────────────── Projects ───────────────────────────

export async function listProjects(ownerId: string, all = false): Promise<ApiResult<ProjectDto[]>> {
  try {
    const rows = await prisma.studioProject.findMany({
      where: all ? {} : { ownerId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { shots: true } },
        // 第一個有關鍵幀的分鏡 → 給尚無成片的進行中專案當封面縮圖（單一查詢，無 N+1）
        shots: { where: { keyframePath: { not: null } }, orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true, updatedAt: true } },
      },
    });
    return ApiResponse.success(
      rows.map((r) => projectToDto(r, { shotCount: r._count.shots, cover: r.shots[0] ?? null })),
      '取得專案列表成功',
    );
  } catch (e) {
    console.error('[StudioService.listProjects]', { ownerId, all }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入專案失敗', ERR_DB);
  }
}

export async function getProject(
  ownerId: string, id: string, options?: StudioOpOptions,
): Promise<ApiResult<ProjectDto>> {
  try {
    const p = await prisma.studioProject.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!p) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    return ApiResponse.success(projectToDto(p), '取得專案成功');
  } catch (e) {
    console.error('[StudioService.getProject]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '讀取專案失敗', ERR_DB);
  }
}

export async function createProject(
  ownerId: string, input: { title: string; description?: string; aspect?: string; fps?: number }, actor?: StudioActor,
): Promise<ApiResult<ProjectDto>> {
  const title = input.title?.trim();
  if (!title) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '請輸入專案標題', 'studio.title_required');
  if (title.length > 120) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '標題長度不可超過 120 字', 'studio.title_too_long');
  try {
    const p = await prisma.studioProject.create({
      data: {
        title,
        description: input.description?.trim() || null,
        aspect: input.aspect ?? '9:16',
        fps: input.fps ?? 30,
        renderQuality: 'high', // 新專案預設高品質(1080p)；既有專案(null) 視為 standard 以零回歸
        status: 'interview',
        ownerId,
      },
    });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'StudioProject', entityId: p.id, action: 'create',
      newValue: { title: p.title }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(projectToDto(p), '專案已建立');
  } catch (e) {
    console.error('[StudioService.createProject]', { ownerId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立專案失敗', ERR_DB);
  }
}

const PROJECT_FIELDS = ['title', 'description', 'logline', 'status', 'aspect', 'fps', 'renderQuality', 'bgmGain'] as const;
type ProjectPatch = Partial<Pick<StudioProject, (typeof PROJECT_FIELDS)[number]>> & {
  /** 字幕圖層樣式 {fontSize,color,position}；Json 欄位，特殊處理。 */
  subtitleStyle?: { fontSize?: number; color?: string; position?: string };
};

/** 編輯專案：標題/題材(description)/前提(logline)/精靈階段(status)/畫幅/幀率。 */
export async function updateProject(
  ownerId: string, id: string, patch: ProjectPatch, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<ProjectDto>> {
  if (patch.title !== undefined) {
    const t = patch.title?.trim();
    if (!t) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '請輸入專案標題', 'studio.title_required');
    if (t.length > 120) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '標題長度不可超過 120 字', 'studio.title_too_long');
  }
  if (patch.renderQuality != null && !['standard', 'high'].includes(patch.renderQuality)) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '成片品質僅支援 standard 或 high', 'studio.render_quality_invalid');
  }
  if (patch.bgmGain != null && (typeof patch.bgmGain !== 'number' || patch.bgmGain < 0 || patch.bgmGain > 1)) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, 'BGM 音量需在 0~1 之間', 'studio.bgm_gain_invalid');
  }
  try {
    const existing = await prisma.studioProject.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    const data: Prisma.StudioProjectUpdateInput = {};
    for (const f of PROJECT_FIELDS) {
      if (patch[f] === undefined) continue;
      if (f === 'title') data.title = patch.title!.trim();
      else if (f === 'description') data.description = patch.description?.trim() || null;
      else if (f === 'logline') data.logline = patch.logline?.trim() || null;
      else (data as Record<string, unknown>)[f] = patch[f];
    }
    if (patch.subtitleStyle !== undefined) data.subtitleStyle = patch.subtitleStyle as Prisma.InputJsonValue;
    const p = await prisma.studioProject.update({ where: { id }, data });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'StudioProject', entityId: id, action: 'update',
      newValue: patch as Record<string, unknown>, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(projectToDto(p), '專案已更新');
  } catch (e) {
    console.error('[StudioService.updateProject]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新專案失敗', ERR_DB);
  }
}

/**
 * 刪除整個專案。DB 端的場景／分鏡／版本／選角／工作皆 onDelete:Cascade 連帶刪除；
 * 磁碟成品目錄（關鍵幀／單鏡影片／成片）best-effort 清除，清理失敗不影響刪除結果。
 * 這是不可復原的操作（成品檔無法還原），UI 端應以明確的危險確認把關。
 */
export async function deleteProject(
  ownerId: string, id: string, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.studioProject.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    await prisma.studioProject.delete({ where: { id } });
    try { await rm(projectDir(id), { recursive: true, force: true }); } catch { /* 磁碟清理失敗不致命，DB 已刪 */ }
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'StudioProject', entityId: id, action: 'delete',
      oldValue: { title: existing.title }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success({ id }, '專案已刪除');
  } catch (e) {
    console.error('[StudioService.deleteProject]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除專案失敗', ERR_DB);
  }
}

/**
 * 複製專案為新「副本」（owner = 呼叫者）。複製腳本層：題材／前提／故事聖經／畫幅／品質／字幕樣式，
 * 連同所有場景（synopsis/dialogue/順序）、分鏡（所有文字欄位＋喜劇欄＋角色指派）與選角清單。
 * 刻意「不」複製已生成的成品（關鍵幀／語音／影片）與磁碟相依欄位（refImage／BGM 檔）——
 * 副本是「同劇本、重新生成」的乾淨起點，分鏡狀態回到 DRAFT。
 */
export async function duplicateProject(
  ownerId: string, id: string, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<ProjectDto>> {
  try {
    const src = await prisma.studioProject.findFirst({
      where: ownerWhere(id, ownerId, options) as Prisma.StudioProjectWhereInput,
      include: {
        scenes: { orderBy: { sortOrder: 'asc' } },
        shots: { orderBy: { sortOrder: 'asc' } },
        projectCharacters: true,
      },
    });
    if (!src) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');

    const newTitle = `${src.title} (副本)`.slice(0, 120);
    // 角色為 owner-scoped。跨擁有者複製（管理者用 view_all 複製他人專案）時，原專案的角色不屬於新 owner，
    // 沿用 characterId／選角會指向看不到的角色（頭像/指派失效）→ 跨擁有者時不複製選角、清掉 characterId。
    const keepCasting = src.ownerId === ownerId;
    const created = await prisma.$transaction(async (tx) => {
      const proj = await tx.studioProject.create({
        data: {
          title: newTitle,
          description: src.description, logline: src.logline,
          premise: src.premise, worldSetting: src.worldSetting, styleGuide: src.styleGuide,
          tone: src.tone, genre: src.genre, targetAudience: src.targetAudience,
          bibleNotes: src.bibleNotes, agentProvider: src.agentProvider,
          aspect: src.aspect, fps: src.fps, renderQuality: src.renderQuality, bgmGain: src.bgmGain,
          ...(src.subtitleStyle != null ? { subtitleStyle: src.subtitleStyle as Prisma.InputJsonValue } : {}),
          status: src.shots.length > 0 ? 'storyboard' : 'interview',
          ownerId,
        },
      });
      // 場景：逐一建立並建立 舊→新 id 對照（分鏡要靠它接回新場景）。
      const sceneIdMap = new Map<string, string>();
      for (const sc of src.scenes) {
        const ns = await tx.scene.create({
          data: { projectId: proj.id, title: sc.title, synopsis: sc.synopsis, dialogue: sc.dialogue, sortOrder: sc.sortOrder, ownerId },
          select: { id: true },
        });
        sceneIdMap.set(sc.id, ns.id);
      }
      // 分鏡：批次建立。重置成品與磁碟相依欄位（status 省略→DB 預設 DRAFT）。
      if (src.shots.length > 0) {
        await tx.shot.createMany({
          data: src.shots.map((s) => ({
            projectId: proj.id,
            sceneId: s.sceneId ? sceneIdMap.get(s.sceneId) ?? null : null,
            shotNo: s.shotNo, sortOrder: s.sortOrder,
            role: s.role, speaker: s.speaker, subtitle: s.subtitle,
            tts: s.tts, visual: s.visual, motion: s.motion, emotion: s.emotion,
            branch: s.branch, caption: s.caption, punchline: s.punchline, sfx: s.sfx,
            punch: s.punch, punchAtFrac: s.punchAtFrac, punchZoom: s.punchZoom,
            keyframeMode: 'sdxl',     // 不複製 refImage／上傳圖 → 回到文生圖
            characterId: keepCasting ? s.characterId : null, // 跨擁有者複製時不沿用看不到的角色
            ownerId,
          })),
        });
      }
      // 選角清單（跨擁有者複製時略過——角色非新 owner 所有）
      if (keepCasting && src.projectCharacters.length > 0) {
        await tx.projectCharacter.createMany({
          data: src.projectCharacters.map((pc) => ({
            projectId: proj.id, characterId: pc.characterId, roleInStory: pc.roleInStory, sortOrder: pc.sortOrder, ownerId,
          })),
        });
      }
      return proj;
    }, { timeout: 15000 }); // 大專案(多場景序列建立)時放寬交易逾時，避免預設 5s 中途回滾

    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'StudioProject', entityId: created.id, action: 'create',
      newValue: { title: created.title, duplicatedFrom: id }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(projectToDto(created), '專案已複製');
  } catch (e) {
    console.error('[StudioService.duplicateProject]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '複製專案失敗', ERR_DB);
  }
}

// ─────────────────────────── Storyboard read ───────────────────────────

export async function getStoryboard(
  ownerId: string, projectId: string, options?: StudioOpOptions,
): Promise<ApiResult<StoryboardDto>> {
  try {
    const project = await prisma.studioProject.findFirst({ where: ownerWhere(projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!project) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    const [scenes, shots] = await Promise.all([
      prisma.scene.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
      prisma.shot.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const byScene = new Map<string, ShotDto[]>();
    for (const sc of scenes) byScene.set(sc.id, []);
    const unassigned: ShotDto[] = [];
    for (const s of shots) {
      const dto = shotToDto(s, shotHasClip(projectId, s.id, [s.lipsyncMp4, s.i2vMp4]));
      if (s.sceneId && byScene.has(s.sceneId)) byScene.get(s.sceneId)!.push(dto);
      else unassigned.push(dto);
    }
    const sceneDtos: SceneDto[] = scenes.map((sc) => sceneToDto(sc, byScene.get(sc.id) ?? []));
    if (unassigned.length) {
      sceneDtos.unshift({ id: '__unassigned__', projectId, title: '未分場', synopsis: null, dialogue: null, sortOrder: -1, shots: unassigned, hasOutput: false, outputUpdatedAt: null });
    }
    return ApiResponse.success({ project: projectToDto(project), scenes: sceneDtos }, '取得分鏡看板成功');
  } catch (e) {
    console.error('[StudioService.getStoryboard]', { ownerId, projectId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入分鏡看板失敗', ERR_DB);
  }
}

// ─────────────────────────── Scenes ───────────────────────────

export async function createScene(
  ownerId: string, projectId: string, input: { title: string; synopsis?: string | null; dialogue?: string | null }, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<SceneDto>> {
  const title = input.title?.trim();
  if (!title) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '請輸入場景標題', 'studio.scene_title_required');
  try {
    const project = await prisma.studioProject.findFirst({ where: ownerWhere(projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!project) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    const agg = await prisma.scene.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const sc = await prisma.scene.create({
      data: {
        projectId, title, sortOrder: (agg._max.sortOrder ?? 0) + SORT_GAP, ownerId: project.ownerId,
        synopsis: input.synopsis?.trim() || null, dialogue: input.dialogue?.trim() || null,
      },
    });
    return ApiResponse.success(sceneToDto(sc, []), '場景已建立');
  } catch (e) {
    console.error('[StudioService.createScene]', { ownerId, projectId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立場景失敗', ERR_DB);
  }
}

const SCENE_FIELDS = ['title', 'synopsis', 'dialogue'] as const;
type ScenePatch = Partial<Pick<Scene, (typeof SCENE_FIELDS)[number]>>;

/** 編輯場景：標題/劇情概要/台詞草稿（腳本層編輯）。 */
export async function updateScene(
  ownerId: string, id: string, patch: ScenePatch, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<SceneDto>> {
  if (patch.title !== undefined && !patch.title?.trim()) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '請輸入場景標題', 'studio.scene_title_required');
  }
  try {
    const existing = await prisma.scene.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.SceneWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此場景', 'studio.scene_not_found');
    const data: Prisma.SceneUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title!.trim();
    if (patch.synopsis !== undefined) data.synopsis = patch.synopsis?.trim() || null;
    if (patch.dialogue !== undefined) data.dialogue = patch.dialogue?.trim() || null;
    const sc = await prisma.scene.update({ where: { id }, data });
    const shots = await prisma.shot.findMany({ where: { sceneId: id }, orderBy: { sortOrder: 'asc' } });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Scene', entityId: id, action: 'update',
      newValue: patch as Record<string, unknown>, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(sceneToDto(sc, shots.map((s) => shotToDto(s, shotHasClip(sc.projectId, s.id, [s.lipsyncMp4, s.i2vMp4])))), '場景已更新');
  } catch (e) {
    console.error('[StudioService.updateScene]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新場景失敗', ERR_DB);
  }
}

/** 刪除場景：其分鏡因 onDelete:SetNull 自動落到「未分場」，不會連帶刪除。 */
export async function deleteScene(
  ownerId: string, id: string, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.scene.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.SceneWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此場景', 'studio.scene_not_found');
    await prisma.scene.delete({ where: { id } });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Scene', entityId: id, action: 'delete',
      oldValue: { title: existing.title }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success({ id }, '場景已刪除');
  } catch (e) {
    console.error('[StudioService.deleteScene]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除場景失敗', ERR_DB);
  }
}

/** 場景重新排序：分數插入 + 必要時 normalize（比照 moveShot）。 */
export async function moveScene(
  ownerId: string, id: string,
  input: { beforeId?: string | null; afterId?: string | null },
  actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<{ id: string; sortOrder: number }>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const scene = await tx.scene.findFirst({
        where: ownerWhere(id, ownerId, options) as Prisma.SceneWhereInput,
        select: { id: true, projectId: true, sortOrder: true },
      });
      if (!scene) return null;
      const sortOrder = await computeSceneSortOrder(tx, scene.projectId, input);
      let updated = await tx.scene.update({ where: { id }, data: { sortOrder }, select: { id: true, sortOrder: true } });
      if (await sceneOrderNeedsNormalize(tx, scene.projectId)) {
        await normalizeSceneOrder(tx, scene.projectId);
        const n = await tx.scene.findUnique({ where: { id }, select: { id: true, sortOrder: true } });
        if (n) updated = n;
      }
      return updated;
    });
    if (!result) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此場景', 'studio.scene_not_found');
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Scene', entityId: id, action: 'move',
      newValue: { sortOrder: result.sortOrder }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(result, '場景已移動');
  } catch (e) {
    console.error('[StudioService.moveScene]', { ownerId, id, input }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '移動場景失敗', ERR_DB);
  }
}

async function computeSceneSortOrder(
  tx: Prisma.TransactionClient, projectId: string,
  input: { beforeId?: string | null; afterId?: string | null },
): Promise<number> {
  const refIds = [input.beforeId, input.afterId].filter((v): v is string => !!v);
  const refs = refIds.length
    ? await tx.scene.findMany({ where: { id: { in: refIds }, projectId }, select: { id: true, sortOrder: true } })
    : [];
  const before = input.beforeId ? refs.find((r) => r.id === input.beforeId) : undefined;
  const after = input.afterId ? refs.find((r) => r.id === input.afterId) : undefined;
  if (!before && !after) {
    const agg = await tx.scene.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    return (agg._max.sortOrder ?? 0) + SORT_GAP;
  }
  if (before && !after) return before.sortOrder + SORT_GAP;
  if (!before && after) return after.sortOrder - SORT_GAP;
  return Math.floor((before!.sortOrder + after!.sortOrder) / 2);
}

async function sceneOrderNeedsNormalize(tx: Prisma.TransactionClient, projectId: string): Promise<boolean> {
  const scenes = await tx.scene.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' }, select: { sortOrder: true } });
  for (let i = 1; i < scenes.length; i++) if (scenes[i].sortOrder - scenes[i - 1].sortOrder < NORMALIZE_THRESHOLD) return true;
  return scenes.some((s) => s.sortOrder < 1);
}

async function normalizeSceneOrder(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const scenes = await tx.scene.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
  for (let i = 0; i < scenes.length; i++) {
    await tx.scene.update({ where: { id: scenes[i].id }, data: { sortOrder: (i + 1) * SORT_GAP } });
  }
}

// ─────────────────────────── Shots (含「手動增加分鏡」) ───────────────────────────

async function maxShotOrderInScene(
  projectId: string, sceneId: string | null, client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const r = await client.shot.aggregate({ where: { projectId, sceneId }, _max: { sortOrder: true } });
  return r._max.sortOrder ?? 0;
}

/** 手動新增一個分鏡（落指定 scene 末端）。shotNo 取專案內最大 + 1。 */
export async function createShot(
  ownerId: string,
  input: {
    projectId: string; sceneId?: string | null;
    visual?: string; tts?: string; motion?: string; subtitle?: string;
    role?: string; speaker?: string; emotion?: string; branch?: string;
    caption?: string; punchline?: string; sfx?: string; punch?: boolean; punchAtFrac?: number; punchZoom?: number;
  },
  actor?: StudioActor,
  options?: StudioOpOptions,
): Promise<ApiResult<ShotDto>> {
  try {
    const project = await prisma.studioProject.findFirst({ where: ownerWhere(input.projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!project) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');

    const sceneId = input.sceneId ?? null;
    const [maxOrder, maxNo] = await Promise.all([
      maxShotOrderInScene(input.projectId, sceneId),
      prisma.shot.aggregate({ where: { projectId: input.projectId }, _max: { shotNo: true } }),
    ]);
    const shot = await prisma.shot.create({
      data: {
        projectId: input.projectId,
        sceneId,
        shotNo: (maxNo._max.shotNo ?? 0) + 1,
        sortOrder: maxOrder + SORT_GAP,
        role: input.role ?? 'narration',
        speaker: input.speaker ?? null,
        subtitle: input.subtitle ?? input.tts ?? null,
        tts: input.tts ?? null,
        visual: input.visual ?? null,
        motion: input.motion ?? null,
        emotion: input.emotion ?? null,
        branch: input.branch ?? 'still',
        caption: input.caption ?? null,
        punchline: input.punchline ?? null,
        sfx: input.sfx ?? null,
        punch: input.punch ?? false,
        punchAtFrac: input.punchAtFrac ?? null,
        punchZoom: input.punchZoom ?? null,
        status: 'DRAFT',
        ownerId: project.ownerId,
      },
    });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Shot', entityId: shot.id, action: 'create',
      newValue: { shotNo: shot.shotNo, visual: shot.visual }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(shotToDto(shot), '分鏡已新增');
  } catch (e) {
    console.error('[StudioService.createShot]', { ownerId, projectId: input.projectId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '新增分鏡失敗', ERR_DB);
  }
}

const SHOT_FIELDS = ['role', 'speaker', 'subtitle', 'tts', 'visual', 'motion', 'emotion', 'branch', 'status', 'caption', 'punchline', 'sfx', 'punch', 'punchAtFrac', 'punchZoom'] as const;
type ShotPatch = Partial<Pick<Shot, (typeof SHOT_FIELDS)[number]>>;

export async function updateShot(
  ownerId: string, id: string, patch: ShotPatch, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<ShotDto>> {
  try {
    const existing = await prisma.shot.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.ShotWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此分鏡', 'studio.shot_not_found');
    const data: Prisma.ShotUpdateInput = {};
    for (const f of SHOT_FIELDS) if (patch[f] !== undefined) (data as Record<string, unknown>)[f] = patch[f];
    const shot = await prisma.shot.update({ where: { id }, data });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Shot', entityId: id, action: 'update',
      newValue: patch as Record<string, unknown>, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(shotToDto(shot), '分鏡已更新');
  } catch (e) {
    console.error('[StudioService.updateShot]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新分鏡失敗', ERR_DB);
  }
}

export async function deleteShot(
  ownerId: string, id: string, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.shot.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.ShotWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此分鏡', 'studio.shot_not_found');
    await prisma.shot.delete({ where: { id } });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Shot', entityId: id, action: 'delete',
      oldValue: { shotNo: existing.shotNo }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success({ id }, '分鏡已刪除');
  } catch (e) {
    console.error('[StudioService.deleteShot]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除分鏡失敗', ERR_DB);
  }
}

/** 移動分鏡：改 sceneId + sortOrder（跨場景與欄內排序），分數插入 + 必要時 normalize。 */
export async function moveShot(
  ownerId: string, id: string,
  input: { sceneId: string | null; beforeId?: string | null; afterId?: string | null },
  actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<{ id: string; sceneId: string | null; sortOrder: number }>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const shot = await tx.shot.findFirst({
        where: ownerWhere(id, ownerId, options) as Prisma.ShotWhereInput,
        select: { id: true, projectId: true, sortOrder: true, ownerId: true },
      });
      if (!shot) return null;
      const sortOrder = await computeShotSortOrder(tx, shot.projectId, input);
      const updated = await tx.shot.update({
        where: { id }, data: { sceneId: input.sceneId, sortOrder },
        select: { id: true, sceneId: true, sortOrder: true },
      });
      let final = updated;
      if (await sceneNeedsNormalize(tx, shot.projectId, input.sceneId)) {
        await normalizeScene(tx, shot.projectId, input.sceneId);
        const n = await tx.shot.findUnique({ where: { id }, select: { id: true, sceneId: true, sortOrder: true } });
        if (n) final = n;
      }
      return final;
    });
    if (!result) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此分鏡', 'studio.shot_not_found');
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Shot', entityId: id, action: 'move',
      newValue: { sceneId: result.sceneId, sortOrder: result.sortOrder }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(result, '分鏡已移動');
  } catch (e) {
    console.error('[StudioService.moveShot]', { ownerId, id, input }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '移動分鏡失敗', ERR_DB);
  }
}

async function computeShotSortOrder(
  tx: Prisma.TransactionClient, projectId: string,
  input: { sceneId: string | null; beforeId?: string | null; afterId?: string | null },
): Promise<number> {
  const refIds = [input.beforeId, input.afterId].filter((v): v is string => !!v);
  const refs = refIds.length
    ? await tx.shot.findMany({ where: { id: { in: refIds }, projectId, sceneId: input.sceneId }, select: { id: true, sortOrder: true } })
    : [];
  const before = input.beforeId ? refs.find((r) => r.id === input.beforeId) : undefined;
  const after = input.afterId ? refs.find((r) => r.id === input.afterId) : undefined;
  if (!before && !after) return (await maxShotOrderInScene(projectId, input.sceneId, tx)) + SORT_GAP;
  if (before && !after) return before.sortOrder + SORT_GAP;
  if (!before && after) return after.sortOrder - SORT_GAP;
  return Math.floor((before!.sortOrder + after!.sortOrder) / 2);
}

async function sceneNeedsNormalize(tx: Prisma.TransactionClient, projectId: string, sceneId: string | null): Promise<boolean> {
  const shots = await tx.shot.findMany({ where: { projectId, sceneId }, orderBy: { sortOrder: 'asc' }, select: { sortOrder: true } });
  for (let i = 1; i < shots.length; i++) if (shots[i].sortOrder - shots[i - 1].sortOrder < NORMALIZE_THRESHOLD) return true;
  return shots.some((s) => s.sortOrder < 1);
}

async function normalizeScene(tx: Prisma.TransactionClient, projectId: string, sceneId: string | null): Promise<void> {
  const shots = await tx.shot.findMany({ where: { projectId, sceneId }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
  for (let i = 0; i < shots.length; i++) {
    await tx.shot.update({ where: { id: shots[i].id }, data: { sortOrder: (i + 1) * SORT_GAP } });
  }
}

// ─────────────────────────── Story Bible（故事聖經，1:1 掛在 StudioProject）───────────────────────────

export type StoryBibleDto = Pick<
  StudioProject,
  'id' | 'description' | 'logline' | 'premise' | 'worldSetting' | 'styleGuide'
  | 'tone' | 'genre' | 'targetAudience' | 'bibleNotes' | 'agentProvider'
>;

export type CharacterDto = Pick<
  Character,
  'id' | 'name' | 'slug' | 'persona' | 'appearance' | 'sealSpeaker' | 'ttsEngine'
  | 'loraScale' | 'voiceInstruct' | 'refImages' | 'faceIdRef' | 'avatarPath' | 'isArchived' | 'createdAt' | 'updatedAt'
>;

export type ProjectCharacterDto = Pick<ProjectCharacter, 'id' | 'projectId' | 'characterId' | 'roleInStory' | 'sortOrder'> & {
  character: CharacterDto;
};

function storyBibleToDto(p: StudioProject): StoryBibleDto {
  return {
    id: p.id, description: p.description, logline: p.logline, premise: p.premise,
    worldSetting: p.worldSetting, styleGuide: p.styleGuide, tone: p.tone, genre: p.genre,
    targetAudience: p.targetAudience, bibleNotes: p.bibleNotes, agentProvider: p.agentProvider,
  };
}

function characterToDto(c: Character): CharacterDto {
  return {
    id: c.id, name: c.name, slug: c.slug, persona: c.persona, appearance: c.appearance,
    sealSpeaker: c.sealSpeaker, ttsEngine: c.ttsEngine, loraScale: c.loraScale, voiceInstruct: c.voiceInstruct,
    refImages: c.refImages, faceIdRef: c.faceIdRef, avatarPath: c.avatarPath, isArchived: c.isArchived,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

function projectCharacterToDto(pc: ProjectCharacter & { character: Character }): ProjectCharacterDto {
  return {
    id: pc.id, projectId: pc.projectId, characterId: pc.characterId, roleInStory: pc.roleInStory,
    sortOrder: pc.sortOrder, character: characterToDto(pc.character),
  };
}

const STORY_BIBLE_FIELDS = [
  'description', 'logline', 'premise', 'worldSetting', 'styleGuide', 'tone', 'genre', 'targetAudience', 'bibleNotes', 'agentProvider',
] as const;
type StoryBiblePatch = Partial<Pick<StudioProject, (typeof STORY_BIBLE_FIELDS)[number]>>;

/** 取故事聖經 + 本專案已選角的角色清單。 */
export async function getStoryBible(
  ownerId: string, projectId: string, options?: StudioOpOptions,
): Promise<ApiResult<StoryBibleDto & { characters: ProjectCharacterDto[] }>> {
  try {
    const project = await prisma.studioProject.findFirst({ where: ownerWhere(projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!project) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    const pcs = await prisma.projectCharacter.findMany({
      where: { projectId }, orderBy: { sortOrder: 'asc' }, include: { character: true },
    });
    return ApiResponse.success({ ...storyBibleToDto(project), characters: pcs.map(projectCharacterToDto) }, '取得故事設定成功');
  } catch (e) {
    console.error('[StudioService.getStoryBible]', { ownerId, projectId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入故事設定失敗', ERR_DB);
  }
}

/** 編輯故事聖經欄位（全部可空，空字串視為清空）。 */
export async function updateStoryBible(
  ownerId: string, projectId: string, patch: StoryBiblePatch, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<StoryBibleDto>> {
  try {
    const existing = await prisma.studioProject.findFirst({ where: ownerWhere(projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    const data: Prisma.StudioProjectUpdateInput = {};
    for (const f of STORY_BIBLE_FIELDS) {
      if (patch[f] === undefined) continue;
      const v = patch[f];
      (data as Record<string, unknown>)[f] = typeof v === 'string' ? (v.trim() || null) : v;
    }
    const p = await prisma.studioProject.update({ where: { id: projectId }, data });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'StudioProject', entityId: projectId, action: 'update',
      newValue: { storyBible: Object.keys(patch) }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(storyBibleToDto(p), '故事設定已更新');
  } catch (e) {
    console.error('[StudioService.updateStoryBible]', { ownerId, projectId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新故事設定失敗', ERR_DB);
  }
}

// ─────────────────────────── Character Library（owner-scoped，可跨專案重用）───────────────────────────

function slugify(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'character';
}

async function uniqueCharacterSlug(ownerId: string, base: string): Promise<string> {
  const existing = await prisma.character.findMany({
    where: { ownerId, slug: { startsWith: base } }, select: { slug: true },
  });
  const taken = new Set(existing.map((c) => c.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) { const s = `${base}-${i}`; if (!taken.has(s)) return s; }
  return `${base}-${existing.length + 1}`;
}

export async function listCharacters(
  ownerId: string, opts?: { includeArchived?: boolean }, options?: StudioOpOptions,
): Promise<ApiResult<CharacterDto[]>> {
  try {
    const where: Prisma.CharacterWhereInput = options?.bypassOwnership ? {} : { ownerId };
    if (!opts?.includeArchived) where.isArchived = false;
    const rows = await prisma.character.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return ApiResponse.success(rows.map(characterToDto), '取得角色庫成功');
  } catch (e) {
    console.error('[StudioService.listCharacters]', { ownerId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入角色庫失敗', ERR_DB);
  }
}

export async function getCharacter(
  ownerId: string, id: string, options?: StudioOpOptions,
): Promise<ApiResult<CharacterDto>> {
  try {
    const c = await prisma.character.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.CharacterWhereInput });
    if (!c) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此角色', 'studio.character_not_found');
    return ApiResponse.success(characterToDto(c), '取得角色成功');
  } catch (e) {
    console.error('[StudioService.getCharacter]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '讀取角色失敗', ERR_DB);
  }
}

export async function createCharacter(
  ownerId: string,
  input: {
    name: string; slug?: string; persona?: string; appearance?: string;
    sealSpeaker?: string; ttsEngine?: string; loraScale?: number; voiceInstruct?: string;
    faceIdRef?: string; refImages?: string[];
  },
  actor?: StudioActor,
): Promise<ApiResult<CharacterDto>> {
  const name = input.name?.trim();
  if (!name) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '請輸入角色名稱', 'studio.character_name_required');
  if (name.length > 120) return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '角色名稱不可超過 120 字', 'studio.character_name_too_long');
  try {
    const slug = await uniqueCharacterSlug(ownerId, input.slug?.trim() || slugify(name));
    const c = await prisma.character.create({
      data: {
        ownerId, name, slug,
        persona: input.persona?.trim() || null,
        appearance: input.appearance?.trim() || null,
        sealSpeaker: input.sealSpeaker?.trim() || null,
        ttsEngine: input.ttsEngine?.trim() || null,
        loraScale: input.loraScale ?? null,
        voiceInstruct: input.voiceInstruct?.trim() || null,
        faceIdRef: input.faceIdRef?.trim() || null,
        refImages: input.refImages ?? undefined,
      },
    });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Character', entityId: c.id, action: 'create',
      newValue: { name: c.name }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(characterToDto(c), '角色已建立');
  } catch (e) {
    console.error('[StudioService.createCharacter]', { ownerId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '建立角色失敗', ERR_DB);
  }
}

const CHARACTER_FIELDS = [
  'name', 'persona', 'appearance', 'sealSpeaker', 'ttsEngine', 'loraScale', 'voiceInstruct', 'faceIdRef', 'avatarPath', 'isArchived',
] as const;
type CharacterPatch = Partial<Pick<Character, (typeof CHARACTER_FIELDS)[number]>> & { refImages?: string[] };

export async function updateCharacter(
  ownerId: string, id: string, patch: CharacterPatch, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<CharacterDto>> {
  if (patch.name !== undefined && !patch.name?.trim()) {
    return ApiResponse.error(ApiReturnCode.VALIDATION_ERROR, '請輸入角色名稱', 'studio.character_name_required');
  }
  try {
    const existing = await prisma.character.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.CharacterWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此角色', 'studio.character_not_found');
    const data: Prisma.CharacterUpdateInput = {};
    for (const f of CHARACTER_FIELDS) {
      if (patch[f] === undefined) continue;
      const v = patch[f];
      (data as Record<string, unknown>)[f] = typeof v === 'string' ? (v.trim() || null) : v;
    }
    if (patch.refImages !== undefined) data.refImages = patch.refImages;
    const c = await prisma.character.update({ where: { id }, data });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Character', entityId: id, action: 'update',
      newValue: { fields: Object.keys(patch) }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(characterToDto(c), '角色已更新');
  } catch (e) {
    console.error('[StudioService.updateCharacter]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '更新角色失敗', ERR_DB);
  }
}

/** 預設軟封存（保護 Shot.characterId 引用）；hard=true 才真刪。 */
export async function deleteCharacter(
  ownerId: string, id: string, opts?: { hard?: boolean }, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.character.findFirst({ where: ownerWhere(id, ownerId, options) as Prisma.CharacterWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此角色', 'studio.character_not_found');
    if (opts?.hard) await prisma.character.delete({ where: { id } });
    else await prisma.character.update({ where: { id }, data: { isArchived: true } });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Character', entityId: id, action: opts?.hard ? 'delete' : 'update',
      oldValue: { name: existing.name, hard: !!opts?.hard }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success({ id }, opts?.hard ? '角色已刪除' : '角色已封存');
  } catch (e) {
    console.error('[StudioService.deleteCharacter]', { ownerId, id }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '刪除角色失敗', ERR_DB);
  }
}

// ─────────────────────────── 選角 (Project ↔ Character) 與指派到分鏡 ───────────────────────────

export async function listProjectCharacters(
  ownerId: string, projectId: string, options?: StudioOpOptions,
): Promise<ApiResult<ProjectCharacterDto[]>> {
  try {
    const project = await prisma.studioProject.findFirst({ where: ownerWhere(projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!project) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    const pcs = await prisma.projectCharacter.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' }, include: { character: true } });
    return ApiResponse.success(pcs.map(projectCharacterToDto), '取得專案角色成功');
  } catch (e) {
    console.error('[StudioService.listProjectCharacters]', { ownerId, projectId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '載入專案角色失敗', ERR_DB);
  }
}

/** 把角色庫的角色選進專案（已存在則更新 roleInStory）。 */
export async function attachCharacterToProject(
  ownerId: string, projectId: string, input: { characterId: string; roleInStory?: string },
  actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<ProjectCharacterDto>> {
  try {
    const project = await prisma.studioProject.findFirst({ where: ownerWhere(projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!project) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    const character = await prisma.character.findFirst({ where: ownerWhere(input.characterId, ownerId, options) as Prisma.CharacterWhereInput });
    if (!character) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此角色', 'studio.character_not_found');
    const agg = await prisma.projectCharacter.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const pc = await prisma.projectCharacter.upsert({
      where: { uq_project_character: { projectId, characterId: input.characterId } },
      create: {
        projectId, characterId: input.characterId, ownerId: project.ownerId,
        roleInStory: input.roleInStory?.trim() || null, sortOrder: (agg._max.sortOrder ?? 0) + SORT_GAP,
      },
      update: { roleInStory: input.roleInStory?.trim() || null },
      include: { character: true },
    });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'ProjectCharacter', entityId: pc.id, action: 'create',
      newValue: { projectId, characterId: input.characterId }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(projectCharacterToDto(pc), '角色已加入專案');
  } catch (e) {
    console.error('[StudioService.attachCharacterToProject]', { ownerId, projectId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '加入專案角色失敗', ERR_DB);
  }
}

export async function detachCharacterFromProject(
  ownerId: string, projectId: string, characterId: string, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<{ projectId: string; characterId: string }>> {
  try {
    const project = await prisma.studioProject.findFirst({ where: ownerWhere(projectId, ownerId, options) as Prisma.StudioProjectWhereInput });
    if (!project) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此專案', 'studio.project_not_found');
    await prisma.projectCharacter.deleteMany({ where: { projectId, characterId } });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'ProjectCharacter', entityId: `${projectId}:${characterId}`, action: 'delete',
      oldValue: { projectId, characterId }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success({ projectId, characterId }, '已移出專案角色');
  } catch (e) {
    console.error('[StudioService.detachCharacterFromProject]', { ownerId, projectId, characterId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '移出專案角色失敗', ERR_DB);
  }
}

/**
 * 指派角色給分鏡 —— 把角色的語音/形象身分「寫進 shot」，讓既有生成引擎免改：
 * 設角色時 shot.speaker=character.sealSpeaker；角色有 faceIdRef 時 shot.refImage + keyframeMode='faceid'。
 * characterId=null 只解除連結，不動既有 speaker/refImage。
 */
export async function assignCharacterToShot(
  ownerId: string, shotId: string, characterId: string | null, actor?: StudioActor, options?: StudioOpOptions,
): Promise<ApiResult<ShotDto>> {
  try {
    const existing = await prisma.shot.findFirst({ where: ownerWhere(shotId, ownerId, options) as Prisma.ShotWhereInput });
    if (!existing) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此分鏡', 'studio.shot_not_found');
    const data: Prisma.ShotUpdateInput = { character: characterId ? { connect: { id: characterId } } : { disconnect: true } };
    if (characterId) {
      const character = await prisma.character.findFirst({ where: ownerWhere(characterId, ownerId, options) as Prisma.CharacterWhereInput });
      if (!character) return ApiResponse.error(ApiReturnCode.NOT_FOUND, '找不到此角色', 'studio.character_not_found');
      if (character.sealSpeaker) data.speaker = character.sealSpeaker;
      if (character.faceIdRef) { data.refImage = character.faceIdRef; data.keyframeMode = 'faceid'; }
    }
    const shot = await prisma.shot.update({ where: { id: shotId }, data });
    await createAuditLog({
      actorId: actor?.id, actorEmail: actor?.email ?? undefined, actorName: actor?.name ?? undefined,
      entityType: 'Shot', entityId: shotId, action: 'update',
      newValue: { characterId }, ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(shotToDto(shot, shotHasClip(shot.projectId, shot.id, [shot.lipsyncMp4, shot.i2vMp4])), '已指派角色');
  } catch (e) {
    console.error('[StudioService.assignCharacterToShot]', { ownerId, shotId, characterId }, e);
    return ApiResponse.error(ApiReturnCode.INTERNAL_ERROR, '指派角色失敗', ERR_DB);
  }
}

// Member 型別參考（避免未使用匯入告警；DTO 不含 owner 物件）
export type { Member, ShotStatus };
