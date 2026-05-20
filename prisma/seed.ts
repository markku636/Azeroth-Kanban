import { randomUUID } from 'node:crypto';
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
  // ─── Selkie 事故 ───
  { code: 'incidents.view',      groupCode: 'INCIDENTS',       groupName: 'Selkie 事故',  name: '檢視事故',       description: '檢視自己負責的事故' },
  { code: 'incidents.create',    groupCode: 'INCIDENTS',       groupName: 'Selkie 事故',  name: '建立事故',       description: '建立新事故' },
  { code: 'incidents.edit',      groupCode: 'INCIDENTS',       groupName: 'Selkie 事故',  name: '編輯事故',       description: '編輯事故狀態 / 嚴重度等' },
  { code: 'incidents.delete',    groupCode: 'INCIDENTS',       groupName: 'Selkie 事故',  name: '刪除事故',       description: '刪除事故' },
  { code: 'incidents.view_all',  groupCode: 'INCIDENTS',       groupName: 'Selkie 事故',  name: '檢視所有事故',   description: '檢視所有使用者的事故' },
  { code: 'incidents.triage',    groupCode: 'INCIDENTS',       groupName: 'Selkie 事故',  name: '觸發 AI 調查',   description: '觸發 Selkie agent 自動 triage 調查' },
  // ─── 角色權限管理 ───
  { code: 'role_permissions.view', groupCode: 'ROLE_PERMISSIONS', groupName: '角色權限', name: '檢視角色權限',   description: '檢視 Role-Permission 指派' },
  { code: 'role_permissions.edit', groupCode: 'ROLE_PERMISSIONS', groupName: '角色權限', name: '編輯角色權限',   description: '在 UI 指派 Role 持有的 permissions' },
  // ─── 主動監控 ───
  { code: 'monitors.view',   groupCode: 'MONITORS', groupName: '主動監控', name: '檢視監控',   description: '檢視監控目標列表與狀態' },
  { code: 'monitors.create', groupCode: 'MONITORS', groupName: '主動監控', name: '新增監控',   description: '新增監控目標' },
  { code: 'monitors.edit',   groupCode: 'MONITORS', groupName: '主動監控', name: '編輯監控',   description: '編輯監控目標 / 啟停 / 立即執行' },
  { code: 'monitors.delete', groupCode: 'MONITORS', groupName: '主動監控', name: '刪除監控',   description: '刪除監控目標' },
  // ─── 通知通道 ───
  { code: 'notification_channels.view',   groupCode: 'NOTIFICATION_CHANNELS', groupName: '通知通道', name: '檢視通知通道', description: '檢視通知通道列表' },
  { code: 'notification_channels.create', groupCode: 'NOTIFICATION_CHANNELS', groupName: '通知通道', name: '新增通知通道', description: '新增 Slack / Webhook / Console 通道' },
  { code: 'notification_channels.edit',   groupCode: 'NOTIFICATION_CHANNELS', groupName: '通知通道', name: '編輯通知通道', description: '編輯通知通道' },
  { code: 'notification_channels.delete', groupCode: 'NOTIFICATION_CHANNELS', groupName: '通知通道', name: '刪除通知通道', description: '刪除通知通道' },
  // ─── 維護視窗 ───
  { code: 'maintenance_windows.view',   groupCode: 'MAINTENANCE_WINDOWS', groupName: '維護視窗', name: '檢視維護視窗', description: '檢視排程維護視窗' },
  { code: 'maintenance_windows.create', groupCode: 'MAINTENANCE_WINDOWS', groupName: '維護視窗', name: '新增維護視窗', description: '新增排程維護視窗' },
  { code: 'maintenance_windows.edit',   groupCode: 'MAINTENANCE_WINDOWS', groupName: '維護視窗', name: '編輯維護視窗', description: '編輯排程維護視窗' },
  { code: 'maintenance_windows.delete', groupCode: 'MAINTENANCE_WINDOWS', groupName: '維護視窗', name: '刪除維護視窗', description: '刪除排程維護視窗' },
] as const;

const ROLE_PERMISSION_MATRIX: Record<string, readonly string[]> = {
  admin: PERMISSIONS.map((p) => p.code),
  user: [
    'incidents.view', 'incidents.create', 'incidents.edit', 'incidents.triage',
    'monitors.view', 'monitors.create', 'monitors.edit',
    'notification_channels.view',
    'maintenance_windows.view',
  ],
  viewer: ['incidents.view', 'monitors.view'],
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

// Selkie：範例事故。code / service 對應 selkie agent 的 mock 後端資料，
// 確保 seed 後開箱即可對 INC-1024 / INC-1025 端到端跑 triage。
const SAMPLE_INCIDENTS = [
  {
    code: 'INC-1024',
    title: 'checkout-api 5xx 錯誤率飆升並出現 pod crashloop',
    service: 'checkout-api',
    description:
      'PagerDuty 告警：checkout-api HTTP 5xx 比例 > 25% 持續 5 分鐘，多個 pod 進入 CrashLoopBackOff。',
    source: 'pagerduty',
    severity: 'SEV1',
    status: 'TRIGGERED',
  },
  {
    code: 'INC-1025',
    title: 'payments-api 付款延遲與失敗率飆升',
    service: 'payments-api',
    description:
      'PagerDuty 告警：payments-api HTTP 5xx > 10% 持續 5 分鐘，p99 延遲 > 5s，多筆付款逾時失敗。',
    source: 'pagerduty',
    severity: 'SEV2',
    status: 'TRIGGERED',
  },
] as const;

async function seedIncidents(): Promise<void> {
  const owner = await prisma.member.findUnique({ where: { email: 'admin@example.com' } });
  if (!owner) {
    console.warn('[seed] admin member not found, skip incidents');
    return;
  }
  for (const inc of SAMPLE_INCIDENTS) {
    await prisma.incident.upsert({
      where: { code: inc.code },
      update: {},
      create: { ...inc, ownerId: owner.id },
    });
  }
  console.log(`[seed] incidents: ${SAMPLE_INCIDENTS.length}`);
}

// ─── 通知通道(主動監控用)───
async function seedNotificationChannels(): Promise<Map<string, string>> {
  const owner = await prisma.member.findUnique({ where: { email: 'admin@example.com' } });
  if (!owner) {
    console.warn('[seed] admin member not found, skip notification channels');
    return new Map();
  }
  const channels = [
    {
      name: 'console-log',
      kind: 'CONSOLE' as const,
      config: { description: '把通知 console.log 到 admin 容器(demo / dev 用)' },
      enabled: true,
    },
  ];
  const map = new Map<string, string>();
  for (const ch of channels) {
    const row = await prisma.notificationChannel.upsert({
      where: { name: ch.name },
      update: { kind: ch.kind, config: ch.config, enabled: ch.enabled },
      create: { ...ch, ownerId: owner.id },
    });
    map.set(ch.name, row.id);
  }
  console.log(`[seed] notification_channels: ${map.size}`);
  return map;
}

// ─── 主動監控:對齊 simulator 注入的 5 種故障情境,涵蓋所有 check kind / log mode ───
type SeedMonitor = {
  name: string;
  kind: 'HTTP' | 'TCP' | 'KEYWORD' | 'PUSH' | 'LOG';
  service: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
  autoTriage?: boolean;
  tags?: string[];
  groupName?: string;
  // HTTP / KEYWORD
  url?: string;
  bodyKeywordInclude?: string;
  // TCP
  tcpHost?: string;
  tcpPort?: number;
  // PUSH
  pushTimeoutSeconds?: number;
  // LOG
  logMode?: 'ERROR_RATE' | 'ERROR_COUNT' | 'LATENCY_P99' | 'KEYWORD';
  logWindowMinutes?: number;
  errorRateThreshold?: number;
  errorCountThreshold?: number;
  latencyP99Threshold?: number;
  logKeyword?: string;
  // 進階
  severityRamp?: Array<{ atOrAbove: number; severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4' }>;
};

const SAMPLE_MONITORS: SeedMonitor[] = [
  // HTTP 健康 ×5(對應 simulator 的 5 個 sim 服務)
  { name: 'checkout-api HTTP',      kind: 'HTTP', service: 'checkout-api',      url: 'http://sim-checkout:3000/api/health',  severity: 'SEV2', autoTriage: true,  tags: ['http', 'checkout'],  groupName: '電商核心' },
  { name: 'payments-api HTTP',      kind: 'HTTP', service: 'payments-api',      url: 'http://sim-payments:3000/api/health',  severity: 'SEV1', autoTriage: true,  tags: ['http', 'payments'],  groupName: '電商核心' },
  { name: 'cart-service HTTP',      kind: 'HTTP', service: 'cart-service',      url: 'http://sim-cart:3000/api/health',      severity: 'SEV2', autoTriage: false, tags: ['http', 'cart'],      groupName: '電商核心' },
  { name: 'order-service HTTP',     kind: 'HTTP', service: 'order-service',     url: 'http://sim-orders:3000/api/health',    severity: 'SEV2', autoTriage: false, tags: ['http', 'orders'],    groupName: '電商核心' },
  { name: 'inventory-service HTTP', kind: 'HTTP', service: 'inventory-service', url: 'http://sim-inventory:3000/api/health', severity: 'SEV1', autoTriage: true,  tags: ['http', 'inventory'], groupName: '電商核心' },
  // LOG ERROR_RATE ×5,帶嚴重度 ramp 示範
  { name: 'checkout-api 錯誤率',     kind: 'LOG', service: 'checkout-api',     logMode: 'ERROR_RATE', logWindowMinutes: 5, errorRateThreshold: 5,  severity: 'SEV3', autoTriage: true,
    severityRamp: [{ atOrAbove: 30, severity: 'SEV1' }, { atOrAbove: 10, severity: 'SEV2' }, { atOrAbove: 5, severity: 'SEV3' }],
    tags: ['log', 'checkout'], groupName: '電商核心' },
  { name: 'payments-api 錯誤率',     kind: 'LOG', service: 'payments-api',     logMode: 'ERROR_RATE', logWindowMinutes: 5, errorRateThreshold: 5,  severity: 'SEV2', autoTriage: true,
    severityRamp: [{ atOrAbove: 30, severity: 'SEV1' }, { atOrAbove: 10, severity: 'SEV2' }],
    tags: ['log', 'payments'], groupName: '電商核心' },
  { name: 'cart-service 錯誤率',     kind: 'LOG', service: 'cart-service',     logMode: 'ERROR_RATE', logWindowMinutes: 5, errorRateThreshold: 10, severity: 'SEV3', tags: ['log', 'cart'],      groupName: '電商核心' },
  { name: 'order-service 錯誤率',    kind: 'LOG', service: 'order-service',    logMode: 'ERROR_RATE', logWindowMinutes: 5, errorRateThreshold: 10, severity: 'SEV3', tags: ['log', 'orders'],    groupName: '電商核心' },
  { name: 'inventory-service 錯誤率', kind: 'LOG', service: 'inventory-service', logMode: 'ERROR_RATE', logWindowMinutes: 5, errorRateThreshold: 10, severity: 'SEV2', tags: ['log', 'inventory'], groupName: '電商核心' },
  // TCP
  { name: 'checkout-api TCP 連線',   kind: 'TCP',     service: 'checkout-api', tcpHost: 'sim-checkout', tcpPort: 3000, severity: 'SEV2', tags: ['tcp', 'checkout'] },
  // KEYWORD(HTTP + body 內容)
  { name: 'checkout-api 健康內容',   kind: 'KEYWORD', service: 'checkout-api', url: 'http://sim-checkout:3000/api/health', bodyKeywordInclude: 'ok', severity: 'SEV3', tags: ['keyword', 'checkout'] },
  // PUSH(範例:daily batch 必須每天 push 心跳)
  { name: 'daily-batch 心跳',        kind: 'PUSH',    service: 'batch-jobs',    pushTimeoutSeconds: 300, severity: 'SEV2', tags: ['push', 'batch'] },
  // LOG LATENCY_P99(對應 cart-service 的 slow 故障)
  { name: 'cart-service p99 延遲',   kind: 'LOG', service: 'cart-service', logMode: 'LATENCY_P99', logWindowMinutes: 5, latencyP99Threshold: 5000, severity: 'SEV3',
    severityRamp: [{ atOrAbove: 15000, severity: 'SEV1' }, { atOrAbove: 8000, severity: 'SEV2' }, { atOrAbove: 5000, severity: 'SEV3' }],
    tags: ['log', 'latency', 'cart'] },
];

// LOG monitor 相依於對應 HTTP monitor —— HTTP 已 DOWN 時抑制 LOG 的重複告警
const SAMPLE_DEPENDENCIES: Array<{ child: string; parent: string }> = [
  { child: 'checkout-api 錯誤率', parent: 'checkout-api HTTP' },
  { child: 'payments-api 錯誤率', parent: 'payments-api HTTP' },
];

async function seedMonitors(channelIdByName: Map<string, string>): Promise<void> {
  const owner = await prisma.member.findUnique({ where: { email: 'admin@example.com' } });
  if (!owner) {
    console.warn('[seed] admin member not found, skip monitors');
    return;
  }
  const consoleChannelId = channelIdByName.get('console-log');

  // 第一輪:upsert 所有 monitors(暫不設 dependsOnMonitorId,因父監控可能尚未存在)
  const nameToId = new Map<string, string>();
  for (const m of SAMPLE_MONITORS) {
    const data = {
      name: m.name,
      kind: m.kind,
      service: m.service,
      severity: m.severity,
      autoTriage: m.autoTriage ?? false,
      tags: m.tags ?? [],
      groupName: m.groupName ?? null,
      url: m.url ?? null,
      bodyKeywordInclude: m.bodyKeywordInclude ?? null,
      tcpHost: m.tcpHost ?? null,
      tcpPort: m.tcpPort ?? null,
      pushTimeoutSeconds: m.pushTimeoutSeconds ?? 600,
      pushToken: m.kind === 'PUSH' ? randomUUID() : null,
      logMode: m.logMode ?? null,
      logWindowMinutes: m.logWindowMinutes ?? 5,
      errorRateThreshold: m.errorRateThreshold ?? null,
      errorCountThreshold: m.errorCountThreshold ?? null,
      latencyP99Threshold: m.latencyP99Threshold ?? null,
      logKeyword: m.logKeyword ?? null,
      severityRamp: m.severityRamp ? (m.severityRamp as unknown as object) : null,
      ownerId: owner.id,
    };
    const row = await prisma.monitor.upsert({
      where: { name: m.name },
      // update 時不動執行期狀態(state / consecutiveFailures / openIncidentId / 計時器欄位)
      update: {
        kind: data.kind,
        service: data.service,
        severity: data.severity,
        autoTriage: data.autoTriage,
        tags: data.tags,
        groupName: data.groupName,
        url: data.url,
        bodyKeywordInclude: data.bodyKeywordInclude,
        tcpHost: data.tcpHost,
        tcpPort: data.tcpPort,
        pushTimeoutSeconds: data.pushTimeoutSeconds,
        logMode: data.logMode,
        logWindowMinutes: data.logWindowMinutes,
        errorRateThreshold: data.errorRateThreshold,
        errorCountThreshold: data.errorCountThreshold,
        latencyP99Threshold: data.latencyP99Threshold,
        logKeyword: data.logKeyword,
        severityRamp: data.severityRamp,
      },
      create: data,
    });
    nameToId.set(m.name, row.id);

    // 關聯 console-log channel(若已 seed)
    if (consoleChannelId) {
      await prisma.monitorChannel.upsert({
        where: { monitorId_channelId: { monitorId: row.id, channelId: consoleChannelId } },
        update: {},
        create: {
          monitorId: row.id,
          channelId: consoleChannelId,
          notifyOnDown: true,
          notifyOnRecovery: true,
          notifyOnReAlert: false,
        },
      });
    }
  }

  // 第二輪:設定 dependsOnMonitorId(父子皆已 upsert)
  for (const dep of SAMPLE_DEPENDENCIES) {
    const childId = nameToId.get(dep.child);
    const parentId = nameToId.get(dep.parent);
    if (childId && parentId) {
      await prisma.monitor.update({
        where: { id: childId },
        data: { dependsOnMonitorId: parentId },
      });
    }
  }

  console.log(`[seed] monitors: ${SAMPLE_MONITORS.length}(含 ${SAMPLE_DEPENDENCIES.length} 個相依)`);
}

async function main() {
  console.log('[seed] start');
  const roleIdByName = await seedRoles();
  const permissionIdByCode = await seedPermissions();
  await seedRolePermissions(roleIdByName, permissionIdByCode);
  await seedMembers();
  await seedIncidents();
  const channelIdByName = await seedNotificationChannels();
  await seedMonitors(channelIdByName);
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
