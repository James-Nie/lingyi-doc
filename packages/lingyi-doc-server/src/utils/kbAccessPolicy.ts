/**
 * 知识库访问策略：以 KB 为访问域统一派生有效角色与权限。
 *
 * 约定：
 * - 所有者 / 创建者 → 始终 owner
 * - kb_members 中显式登记 → 用其角色
 * - visibility=organization + 当前身份为该租户 active 成员 → 默认 viewer
 *   - 租户管理员（tenantRole=2）进一步升为 admin（可写）
 * - 其他 → null（无访问权）
 *
 * 所有 KB / KB 内文档 / 节点 / 邀请等访问判断都应走本模块，
 * 避免 SQL 与代码判断各搞一套导致的"看得到进不去"问题。
 */
import type { DataSource } from 'typeorm';
import { In } from 'typeorm';
import {
  KbMemberEntity,
  KnowledgeBaseEntity,
} from '../database/entities/knowledge-base.entity';
import { TenantMemberEntity } from '../database/entities/tenant.entity';
import type { KbMemberRole } from '../types/knowledge-base';

/** 访问策略模块依赖的数据源形态：兼容 typeorm 的 DataSource。 */
type KbAccessDataSource = Pick<DataSource, 'getRepository'>;

const ROLE_RANK: Record<KbMemberRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export function compareKbRole(a: KbMemberRole, b: KbMemberRole): number {
  return ROLE_RANK[a] - ROLE_RANK[b];
}

export function hasAtLeastKbRole(role: KbMemberRole | null, min: KbMemberRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface EffectiveKbRoleInput {
  kb: KnowledgeBaseEntity;
  userId: string;
  isTenantMember?: boolean | null;
  isTenantAdmin?: boolean | null;
}

export interface TenantMembershipSnapshot {
  isTenantMember: boolean;
  isTenantAdmin: boolean;
}

/** 角色优先级：owner > admin > editor > viewer */
function maxRole(a: KbMemberRole | null, b: KbMemberRole | null): KbMemberRole | null {
  if (!a) return b;
  if (!b) return a;
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

/**
 * 派生用户在指定 KB 下的有效角色（不读 DB，依赖传入的上下文）。
 * 调用方负责预加载 kb、isTenantMember / isTenantAdmin。
 */
export function deriveEffectiveKbRole(input: EffectiveKbRoleInput): KbMemberRole | null {
  const { kb, userId, isTenantMember, isTenantAdmin } = input;

  // 创建者始终 owner
  if (kb.createdBy === userId) return 'owner';
  // 个人 KB 所有者
  if (kb.scope === 1 && kb.ownerId === userId) return 'owner';

  // 显式成员（由调用方查询后通过 memberRole 注入）
  // 显式成员的处理在 resolveEffectiveKbRoleWithDb 中

  // 组织可见 + 租户 active 成员 → 默认 viewer；租户管理员升 admin
  if (
    kb.scope === 2
    && kb.tenantId
    && kb.visibility === 'organization'
    && isTenantMember
  ) {
    return isTenantAdmin ? 'admin' : 'viewer';
  }

  return null;
}

export interface ResolveEffectiveKbRoleOptions {
  /** 是否仅依赖快照（避免回查 DB），由调用方在性能敏感路径中预取 */
  memberRole?: KbMemberRole | null;
  tenant?: TenantMembershipSnapshot | null;
}

/**
 * 加载用户对 KB 的显式成员角色；找不到返回 null。
 * 拆出来便于在批量场景里先一次性批量预取。
 */
export async function loadKbMemberRole(
  dataSource: KbAccessDataSource,
  kbId: string,
  userId: string,
): Promise<KbMemberRole | null> {
  if (!kbId || !userId) return null;
  const repo = dataSource.getRepository(KbMemberEntity);
  const member = await repo.findOne({ where: { kbId, userId } });
  return member ? (member.role as KbMemberRole) : null;
}

export async function loadTenantMembership(
  dataSource: KbAccessDataSource,
  tenantId: string,
  userId: string,
): Promise<TenantMembershipSnapshot> {
  if (!tenantId || !userId) {
    return { isTenantMember: false, isTenantAdmin: false };
  }
  const repo = dataSource.getRepository(TenantMemberEntity);
  const row = await repo.findOne({ where: { tenantId, userId, status: 1 } });
  if (!row) return { isTenantMember: false, isTenantAdmin: false };
  // tenantRole: 1 已废弃（项目约定不分配给租户成员），2 = 管理员，3 = 成员
  return {
    isTenantMember: true,
    isTenantAdmin: row.tenantRole === 2,
  };
}

/**
 * 综合派生有效角色（DB 读取版）。
 * 建议在 controller 入口或 service 关键方法里复用，避免各模块重复查询。
 */
export async function resolveEffectiveKbRole(
  dataSource: KbAccessDataSource,
  kb: KnowledgeBaseEntity,
  userId: string,
): Promise<KbMemberRole | null> {
  const explicitRole = await loadKbMemberRole(dataSource, kb.id, userId);
  const tenant = kb.scope === 2 && kb.tenantId
    ? await loadTenantMembership(dataSource, kb.tenantId, userId)
    : null;
  return maxRole(
    explicitRole,
    deriveEffectiveKbRole({
      kb,
      userId,
      isTenantMember: tenant?.isTenantMember ?? false,
      isTenantAdmin: tenant?.isTenantAdmin ?? false,
    }),
  );
}

/**
 * 批量预取一组 KB 对指定用户的有效角色。
 * 返回 Map<kbId, KbMemberRole | null>。
 */
export async function batchResolveEffectiveKbRole(
  dataSource: KbAccessDataSource,
  kbs: KnowledgeBaseEntity[],
  userId: string,
): Promise<Map<string, KbMemberRole | null>> {
  const result = new Map<string, KbMemberRole | null>();
  if (kbs.length === 0) return result;

  const kbIds = kbs.map((kb) => kb.id);
  const memberRepo = dataSource.getRepository(KbMemberEntity);
  const members = await memberRepo.find({ where: { kbId: In(kbIds), userId } });
  const memberRoleByKb = new Map(members.map((m) => [m.kbId, m.role as KbMemberRole]));

  const tenantIds = Array.from(
    new Set(
      kbs
        .filter((kb) => kb.scope === 2 && kb.tenantId)
        .map((kb) => kb.tenantId as string),
    ),
  );

  const tenantMap = new Map<string, TenantMembershipSnapshot>();
  if (tenantIds.length > 0) {
    const tenantRepo = dataSource.getRepository(TenantMemberEntity);
    const rows = await tenantRepo.find({
      where: { userId, tenantId: In(tenantIds), status: 1 },
    });
    for (const row of rows) {
      tenantMap.set(row.tenantId, {
        isTenantMember: true,
        isTenantAdmin: row.tenantRole === 2,
      });
    }
  }

  for (const kb of kbs) {
    const explicit = memberRoleByKb.get(kb.id) ?? null;
    const tenant = kb.scope === 2 && kb.tenantId
      ? tenantMap.get(kb.tenantId) ?? { isTenantMember: false, isTenantAdmin: false }
      : null;
    const effective = maxRole(
      explicit,
      deriveEffectiveKbRole({
        kb,
        userId,
        isTenantMember: tenant?.isTenantMember ?? false,
        isTenantAdmin: tenant?.isTenantAdmin ?? false,
      }),
    );
    result.set(kb.id, effective);
  }
  return result;
}

/**
 * 文档读权限：KB 视角下的可读判定（用于 SQL EXISTS 子句）。
 * 命中任一即视为有读权限：
 * 1. KB 创建者 / 个人 KB 所有者
 * 2. kb_members 任意角色
 * 3. KB visibility=organization + 当前身份为该租户 active 成员
 *    （仅当上下文为租户身份或通过显式 userId/tenantId 调用）
 */
export function buildKbDocumentReadExistsSql(alias = 'd'): string {
  return `EXISTS (
    SELECT 1 FROM kb_nodes kn
    INNER JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = false
    WHERE kn.doc_id = ${alias}.id
      AND kn.is_deleted = false
      AND (
        kb.created_by = :kbAccessUserId
        OR (kb.scope = 1 AND kb.owner_id = :kbAccessUserId)
        OR EXISTS (
          SELECT 1 FROM kb_members km
          WHERE km.kb_id = kb.id AND km.user_id = :kbAccessUserId
        )
        OR (
          kb.scope = 2
          AND kb.visibility = 'organization'
          AND EXISTS (
            SELECT 1 FROM tenant_members tm
            WHERE tm.user_id = :kbAccessUserId
              AND tm.tenant_id = kb.tenant_id
              AND tm.status = 1
          )
        )
      )
  )`;
}

/**
 * 文档写权限：KB 视角下的可写判定。
 * 1. KB 创建者 / 个人 KB 所有者
 * 2. kb_members 中 role ∈ {owner, admin, editor}
 * 3. KB visibility=organization + 当前身份为该租户 active 成员 且 tenantRole=2（管理员）
 */
export function buildKbDocumentWriteExistsSql(alias = 'd'): string {
  return `EXISTS (
    SELECT 1 FROM kb_nodes kn
    INNER JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = false
    WHERE kn.doc_id = ${alias}.id
      AND kn.is_deleted = false
      AND (
        kb.created_by = :kbAccessUserId
        OR (kb.scope = 1 AND kb.owner_id = :kbAccessUserId)
        OR EXISTS (
          SELECT 1 FROM kb_members km
          WHERE km.kb_id = kb.id
            AND km.user_id = :kbAccessUserId
            AND km.role IN ('owner', 'admin', 'editor')
        )
        OR (
          kb.scope = 2
          AND kb.visibility = 'organization'
          AND EXISTS (
            SELECT 1 FROM tenant_members tm
            WHERE tm.user_id = :kbAccessUserId
              AND tm.tenant_id = kb.tenant_id
              AND tm.status = 1
              AND tm.tenant_role = 2
          )
        )
      )
  )`;
}

/**
 * KB 列表的"我能看到哪些"判定 SQL。
 * 1. 个人 KB 所有者 / KB 创建者
 * 2. 显式 kb_members
 * 3. 租户模式下 visibility=organization
 */
export function buildKbListAccessSql(userId: string): { sql: string; params: Record<string, string> } {
  return {
    sql: `(
      (kb.scope = 1 AND kb.owner_id = :kbListUserId)
      OR kb.created_by = :kbListUserId
      OR EXISTS (
        SELECT 1 FROM kb_members m
        WHERE m.kb_id = kb.id AND m.user_id = :kbListUserId
      )
      OR (
        kb.scope = 2
        AND kb.visibility = 'organization'
        AND EXISTS (
          SELECT 1 FROM tenant_members tm
          WHERE tm.user_id = :kbListUserId
            AND tm.tenant_id = kb.tenant_id
            AND tm.status = 1
        )
      )
    )`,
    params: { kbListUserId: userId },
  };
}

/** 保留：documentAccessContext 中按 doc 自身 scope 访问的 helper 不变。 */
