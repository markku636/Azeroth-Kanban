import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'admin',  displayName: '系統管理員', description: '擁有所有功能與管理權限',                   isSystem: true },
  { name: 'user',   displayName: '一般使用者', description: '可使用 Kanban 看板（CRUD 自己的卡片）',     isSystem: true },
  { name: 'viewer', displayName: '檢視者',     description: '僅可檢視自己的看板（唯讀）',                 isSystem: true },
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
  // ─── Kanban ───
  { code: 'kanban.view',         groupCode: 'KANBAN',          groupName: '看板',         name: '檢視看板',       description: '進入 Kanban 並檢視自己的卡片' },
  { code: 'kanban.create',       groupCode: 'KANBAN',          groupName: '看板',         name: '新增卡片',       description: '建立新卡片' },
  { code: 'kanban.edit',         groupCode: 'KANBAN',          groupName: '看板',         name: '編輯卡片',       description: '編輯卡片（含拖拉改狀態 / 排序）' },
  { code: 'kanban.delete',       groupCode: 'KANBAN',          groupName: '看板',         name: '刪除卡片',       description: '刪除卡片' },
  { code: 'kanban.view_all',     groupCode: 'KANBAN',          groupName: '看板',         name: '檢視所有卡片',   description: '檢視所有使用者建立的卡片（含 owner 資訊）' },
  { code: 'kanban.edit_all',     groupCode: 'KANBAN',          groupName: '看板',         name: '編輯所有卡片',   description: '編輯任何使用者的卡片（含拖拉改狀態 / 排序）' },
  { code: 'kanban.delete_all',   groupCode: 'KANBAN',          groupName: '看板',         name: '刪除所有卡片',   description: '刪除任何使用者的卡片' },
  // ─── 角色權限管理 ───
  { code: 'role_permissions.view', groupCode: 'ROLE_PERMISSIONS', groupName: '角色權限', name: '檢視角色權限',   description: '檢視 Role-Permission 指派' },
  { code: 'role_permissions.edit', groupCode: 'ROLE_PERMISSIONS', groupName: '角色權限', name: '編輯角色權限',   description: '在 UI 指派 Role 持有的 permissions' },
] as const;

const ROLE_PERMISSION_MATRIX: Record<string, readonly string[]> = {
  admin: PERMISSIONS.map((p) => p.code),
  user: ['kanban.view', 'kanban.create', 'kanban.edit', 'kanban.delete'],
  viewer: ['kanban.view'],
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
