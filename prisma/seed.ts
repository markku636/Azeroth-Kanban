import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'admin',  displayName: '系統管理員', description: '擁有所有功能與管理權限',                   isSystem: true },
  { name: 'user',   displayName: '一般使用者', description: '可使用影片工作室（CRUD 自己的專案）',         isSystem: true },
  { name: 'viewer', displayName: '檢視者',     description: '僅可檢視自己的影片專案（唯讀）',             isSystem: true },
] as const;

const PERMISSIONS = [
  // ─── 角色管理 ───
  { code: 'roles.view',          groupCode: 'ROLES',           groupName: '角色管理',     name: '檢視角色',       description: '檢視角色列表' },
  { code: 'roles.create',        groupCode: 'ROLES',           groupName: '角色管理',     name: '新增角色',       description: '新增角色' },
  { code: 'roles.edit',          groupCode: 'ROLES',           groupName: '角色管理',     name: '編輯角色',       description: '編輯角色資訊' },
  { code: 'roles.delete',        groupCode: 'ROLES',           groupName: '角色管理',     name: '刪除角色',       description: '刪除非系統角色' },
  // ─── 使用者角色 ───
  { code: 'user_roles.view',     groupCode: 'USER_ROLES',      groupName: '使用者角色',   name: '檢視使用者角色', description: '檢視使用者-角色指派' },
  { code: 'user_roles.edit',     groupCode: 'USER_ROLES',      groupName: '使用者角色',   name: '編輯使用者角色', description: '指派 / 調整使用者角色' },
  // ─── 稽核 ───
  { code: 'audit_logs.view',     groupCode: 'AUDIT',           groupName: '稽核',         name: '檢視稽核紀錄',   description: '檢視稽核紀錄' },
  { code: 'login_records.view',  groupCode: 'AUDIT',           groupName: '稽核',         name: '檢視登入紀錄',   description: '檢視登入紀錄' },
  // ─── 角色權限管理 ───
  { code: 'role_permissions.view', groupCode: 'ROLE_PERMISSIONS', groupName: '角色權限', name: '檢視角色權限',   description: '檢視 Role-Permission 指派' },
  { code: 'role_permissions.edit', groupCode: 'ROLE_PERMISSIONS', groupName: '角色權限', name: '編輯角色權限',   description: '在 UI 指派 Role 持有的 permissions' },

  // ─── Studio 影片工作室 ───
  { code: 'studio.view',         groupCode: 'STUDIO', groupName: 'Studio 影片工作室', name: '檢視工作室',     description: '進入影片工作室並檢視自己的專案' },
  { code: 'studio.create',       groupCode: 'STUDIO', groupName: 'Studio 影片工作室', name: '建立專案',       description: '建立新的影片專案' },
  { code: 'studio.edit',         groupCode: 'STUDIO', groupName: 'Studio 影片工作室', name: '編輯專案/分鏡',  description: '編輯專案、場景與分鏡（含新增/拖拉分鏡）' },
  { code: 'studio.delete',       groupCode: 'STUDIO', groupName: 'Studio 影片工作室', name: '刪除專案/分鏡',  description: '刪除專案、場景與分鏡' },
  { code: 'studio.view_all',     groupCode: 'STUDIO', groupName: 'Studio 影片工作室', name: '檢視所有專案',   description: '檢視所有使用者的影片專案' },
  { code: 'studio.edit_all',     groupCode: 'STUDIO', groupName: 'Studio 影片工作室', name: '編輯所有專案',   description: '編輯任何使用者的專案與分鏡' },
  { code: 'studio.delete_all',   groupCode: 'STUDIO', groupName: 'Studio 影片工作室', name: '刪除所有專案',   description: '刪除任何使用者的專案與分鏡' },

  // ─── 媒體庫 ───
  { code: 'media.view',          groupCode: 'MEDIA',  groupName: '媒體庫',           name: '檢視媒體庫',     description: '進入媒體庫並檢視自己上傳的檔案' },
  { code: 'media.create',        groupCode: 'MEDIA',  groupName: '媒體庫',           name: '上傳媒體',       description: '上傳檔案到媒體庫' },
  { code: 'media.delete',        groupCode: 'MEDIA',  groupName: '媒體庫',           name: '刪除媒體',       description: '刪除自己上傳的媒體檔案' },
  { code: 'media.view_all',      groupCode: 'MEDIA',  groupName: '媒體庫',           name: '檢視所有媒體',   description: '檢視所有使用者上傳的媒體' },
  { code: 'media.delete_all',    groupCode: 'MEDIA',  groupName: '媒體庫',           name: '刪除所有媒體',   description: '刪除任何使用者的媒體檔案' },
] as const;

const ROLE_PERMISSION_MATRIX: Record<string, readonly string[]> = {
  admin: PERMISSIONS.map((p) => p.code),
  user: ['studio.view', 'studio.create', 'studio.edit', 'studio.delete', 'media.view', 'media.create', 'media.delete'],
  viewer: ['studio.view', 'media.view'],
};

const DEFAULT_MEMBERS = [
  { email: 'admin@example.com',  name: '系統管理員', role: 'admin',  rawPassword: 'Admin@1234'  },
  { email: 'user@example.com',   name: '一般使用者', role: 'user',   rawPassword: 'User@1234'   },
  { email: 'viewer@example.com', name: '檢視者',     role: 'viewer', rawPassword: 'Viewer@1234' },
] as const;

const BCRYPT_COST = 12;

async function seedRoles(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { displayName: r.displayName, description: r.description, isSystem: r.isSystem },
      create: { name: r.name, displayName: r.displayName, description: r.description, isSystem: r.isSystem },
    });
    map.set(r.name, role.id);
  }
  console.log(`[seed] roles: ${map.size}`);
  return map;
}

async function seedPermissions(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, groupCode: p.groupCode, groupName: p.groupName, description: p.description },
      create: { code: p.code, name: p.name, groupCode: p.groupCode, groupName: p.groupName, description: p.description },
    });
    map.set(p.code, perm.id);
  }
  console.log(`[seed] permissions: ${map.size}`);
  return map;
}

async function seedRolePermissions(
  roleIdByName: Map<string, string>,
  permissionIdByCode: Map<string, string>
): Promise<void> {
  let total = 0;
  for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) {
      console.warn(`[seed] role not found: ${roleName}`);
      continue;
    }
    // 重建：先清空、再插入，確保 matrix 即真相
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    for (const code of permCodes) {
      const permissionId = permissionIdByCode.get(code);
      if (!permissionId) {
        console.warn(`[seed] permission not found: ${code}`);
        continue;
      }
      await prisma.rolePermission.create({ data: { roleId, permissionId } });
      total++;
    }
  }
  console.log(`[seed] role_permissions: ${total}`);
}

async function seedMembers(): Promise<void> {
  for (const m of DEFAULT_MEMBERS) {
    const hashed = await bcrypt.hash(m.rawPassword, BCRYPT_COST);
    await prisma.member.upsert({
      where: { email: m.email },
      update: { name: m.name, role: m.role, isActive: true },
      // 預設帳號的 password 僅作 Credentials fallback（AUTH_ALLOW_CREDENTIALS=true 時使用）
      // keycloakSub 預設 null，首次 SSO 登入時由 auth.ts 寫入
      create: { email: m.email, password: hashed, name: m.name, role: m.role, isActive: true },
    });
  }
  console.log(`[seed] members: ${DEFAULT_MEMBERS.length}`);
}

async function main() {
  console.log('[seed] start');
  const roleIdByName = await seedRoles();
  const permissionIdByCode = await seedPermissions();
  await seedRolePermissions(roleIdByName, permissionIdByCode);
  await seedMembers();
  console.log('[seed] done');
}

main()
  .catch((e) => {
    console.error('[seed] failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
