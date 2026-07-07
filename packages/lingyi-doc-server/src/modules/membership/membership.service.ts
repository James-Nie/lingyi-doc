import { Injectable } from '@nestjs/common';
import { DeployService } from '../../config/deploy.service';
import { DocumentRepository } from '../../repositories/document.repository';
import { QuotaDailyLogRepository } from '../../repositories/quota-daily-log.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import type { DocumentAccessContext } from '../../types/session';
import type {
  DocumentSpaceMeta,
  EffectivePlan,
  MembershipContext,
  MembershipFeatureKey,
  MembershipSpaceKind,
  MembershipSummary,
  MembershipPlanCode,
  QuotaUsage,
} from '../../types/membership';
import {
  buildFeatureMap,
  buildQuotaWarnings,
  calcQuotaPercent,
  planLabel,
  quotaLimitsFor,
  resolveEffectivePlan,
  TRIAL_DAYS_TEAM,
} from './membership-policy';
import { membershipError } from './membership.errors';

function toQuotaUsage(used: number, limit: number | null): QuotaUsage {
  return {
    used,
    limit,
    percent: calcQuotaPercent(used, limit),
  };
}

@Injectable()
export class MembershipService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly documentRepository: DocumentRepository,
    private readonly quotaDailyLogRepository: QuotaDailyLogRepository,
    private readonly deployService: DeployService,
  ) {}

  async resolveContext(auth: AuthUser): Promise<MembershipContext> {
    const user = await this.userRepository.findEntityById(auth.userId);
    if (!user) {
      return this.personalContext(auth.userId, 'free', false, null, false);
    }

    const isTeamIdentity = auth.currentIdentityType === 'tenant' && auth.currentTenantId;

    if (isTeamIdentity && auth.currentTenantId) {
      return this.resolveTeamContext(user.canCreateTeam === 1, auth.currentTenantId);
    }

    const { plan, expired } = resolveEffectivePlan(
      user.personalPlan as MembershipPlanCode,
      user.personalVipExpireAt,
    );

    return this.personalContext(
      auth.userId,
      plan,
      expired,
      user.personalVipExpireAt,
      user.canCreateTeam === 1,
    );
  }

  async resolveContextForDocument(meta: DocumentSpaceMeta, auth: AuthUser): Promise<MembershipContext> {
    const user = await this.userRepository.findEntityById(auth.userId);
    const canCreateTeam = user?.canCreateTeam === 1;

    if (meta.scope === 2 && meta.tenantId) {
      return this.resolveTeamContext(canCreateTeam, meta.tenantId);
    }

    const ownerId = meta.ownerId ?? auth.userId;
    if (!user) {
      return this.personalContext(ownerId, 'free', false, null, false);
    }

    const { plan, expired } = resolveEffectivePlan(
      user.personalPlan as MembershipPlanCode,
      user.personalVipExpireAt,
    );

    return this.personalContext(ownerId, plan, expired, user.personalVipExpireAt, canCreateTeam);
  }

  private async resolveTeamContext(
    canCreateTeam: boolean,
    tenantId: string,
  ): Promise<MembershipContext> {
    if (this.deployService.isPrivate()) {
      return {
        spaceKind: 'team',
        effectivePlan: 'vip',
        planExpired: false,
        expireAt: null,
        userId: '',
        tenantId,
        canCreateTeam,
        spaceId: tenantId,
      };
    }

    const tenant = await this.tenantRepository.findEntityById(tenantId);
    if (!tenant) {
      return {
        spaceKind: 'team',
        effectivePlan: 'free',
        planExpired: false,
        expireAt: null,
        userId: '',
        tenantId,
        canCreateTeam,
        spaceId: tenantId,
      };
    }

    const { plan, expired } = resolveEffectivePlan(
      tenant.teamPlan as MembershipPlanCode,
      tenant.teamVipExpireAt,
    );

    return {
      spaceKind: 'team',
      effectivePlan: plan,
      planExpired: expired,
      expireAt: tenant.teamVipExpireAt,
      userId: '',
      tenantId,
      canCreateTeam,
      spaceId: tenantId,
    };
  }

  private personalContext(
    userId: string,
    plan: EffectivePlan,
    planExpired: boolean,
    expireAt: Date | null,
    canCreateTeam: boolean,
  ): MembershipContext {
    return {
      spaceKind: 'personal',
      effectivePlan: plan,
      planExpired,
      expireAt,
      userId,
      tenantId: null,
      canCreateTeam,
      spaceId: userId,
    };
  }

  private spaceKindCode(kind: MembershipSpaceKind): 1 | 2 {
    return kind === 'personal' ? 1 : 2;
  }

  async getUsage(ctx: MembershipContext): Promise<{
    docCount: number;
    storageBytes: number;
    memberCount: number | null;
    dailyExports: number;
  }> {
    let docCount = 0;
    let storageBytes = 0;
    let memberCount: number | null = null;

    if (ctx.spaceKind === 'personal') {
      docCount = await this.documentRepository.countByOwner(ctx.spaceId);
      storageBytes = await this.documentRepository.sumStorageByOwner(ctx.spaceId);
    } else if (ctx.tenantId) {
      docCount = await this.documentRepository.countByTenant(ctx.tenantId);
      storageBytes = await this.documentRepository.sumStorageByTenant(ctx.tenantId);
      memberCount = await this.tenantMemberRepository.countByTenant(ctx.tenantId);
    }

    const dailyExports = await this.quotaDailyLogRepository.getCount(
      this.spaceKindCode(ctx.spaceKind),
      ctx.spaceId,
      'export',
    );

    return { docCount, storageBytes, memberCount, dailyExports };
  }

  isSpaceReadOnly(
    ctx: MembershipContext,
    usage: { docCount: number; storageBytes: number },
  ): boolean {
    const limits = quotaLimitsFor(ctx.spaceKind, ctx.effectivePlan);
    const docOver = limits.maxDocuments != null && usage.docCount > limits.maxDocuments;
    const storageOver = limits.maxStorageBytes != null && usage.storageBytes > limits.maxStorageBytes;
    return docOver || storageOver;
  }

  async getSummary(auth: AuthUser): Promise<MembershipSummary> {
    const ctx = await this.resolveContext(auth);
    const limits = quotaLimitsFor(ctx.spaceKind, ctx.effectivePlan);
    const usage = await this.getUsage(ctx);

    const quotas = {
      documents: toQuotaUsage(usage.docCount, limits.maxDocuments),
      storageBytes: toQuotaUsage(usage.storageBytes, limits.maxStorageBytes),
      dailyExports: toQuotaUsage(usage.dailyExports, limits.maxDailyExports),
      members: usage.memberCount == null
        ? null
        : toQuotaUsage(usage.memberCount, limits.maxMembers),
    };

    return {
      spaceKind: ctx.spaceKind,
      plan: ctx.effectivePlan,
      planLabel: planLabel(ctx.spaceKind, ctx.effectivePlan),
      planExpired: ctx.planExpired,
      expireAt: ctx.expireAt?.toISOString() ?? null,
      canCreateTeam: ctx.canCreateTeam && this.deployService.canCreateTenant(),
      readOnly: this.isSpaceReadOnly(ctx, usage),
      warnings: buildQuotaWarnings(quotas),
      quotas,
      features: buildFeatureMap(ctx.spaceKind, ctx.effectivePlan),
    };
  }

  async assertWritableForDocument(auth: AuthUser, meta: DocumentSpaceMeta): Promise<MembershipContext> {
    const ctx = await this.resolveContextForDocument(meta, auth);
    const usage = await this.getUsage(ctx);
    if (this.isSpaceReadOnly(ctx, usage)) {
      throw membershipError(
        'QUOTA_LIMIT',
        ctx.spaceKind === 'personal'
          ? '个人空间配额已超限，当前仅支持只读查看，请升级会员或清理空间'
          : '团队空间配额已超限，当前仅支持只读查看，请升级团队会员',
      );
    }
    return ctx;
  }

  async assertStorageDeltaForDocument(
    auth: AuthUser,
    meta: DocumentSpaceMeta,
    deltaBytes: number,
  ): Promise<void> {
    if (deltaBytes <= 0) return;

    const ctx = await this.assertWritableForDocument(auth, meta);
    const limits = quotaLimitsFor(ctx.spaceKind, ctx.effectivePlan);
    if (limits.maxStorageBytes == null) return;

    const usage = await this.getUsage(ctx);
    if (usage.storageBytes + deltaBytes > limits.maxStorageBytes) {
      throw membershipError(
        'QUOTA_LIMIT',
        ctx.spaceKind === 'personal'
          ? '个人存储空间不足，请升级会员或清理文件'
          : '团队存储空间不足，请升级团队会员',
      );
    }
  }

  async assertCanCreateDocument(auth: AuthUser, ctx?: DocumentAccessContext): Promise<void> {
    const accessCtx = ctx ?? {
      userId: auth.userId,
      identityType: auth.currentIdentityType ?? 'personal',
      tenantId: auth.currentTenantId ?? null,
    };

    const membershipCtx: MembershipContext = accessCtx.identityType === 'tenant' && accessCtx.tenantId
      ? await this.resolveContext({
        ...auth,
        currentIdentityType: 'tenant',
        currentTenantId: accessCtx.tenantId,
      })
      : await this.resolveContext({
        ...auth,
        currentIdentityType: 'personal',
        currentTenantId: null,
      });

    await this.assertWritableForDocument(auth, {
      scope: membershipCtx.spaceKind === 'team' ? 2 : 1,
      ownerId: membershipCtx.spaceKind === 'personal' ? membershipCtx.spaceId : accessCtx.userId,
      tenantId: membershipCtx.tenantId,
      storageSize: 0,
    });

    const limits = quotaLimitsFor(membershipCtx.spaceKind, membershipCtx.effectivePlan);
    if (limits.maxDocuments == null) return;

    const usage = await this.getUsage(membershipCtx);
    if (usage.docCount >= limits.maxDocuments) {
      throw membershipError(
        'QUOTA_LIMIT',
        membershipCtx.spaceKind === 'personal'
          ? `个人文档数量已达上限（${limits.maxDocuments} 篇），请升级会员或清理文档`
          : `团队文档数量已达上限（${limits.maxDocuments} 篇），请升级团队会员`,
      );
    }
  }

  async assertCanExport(
    auth: AuthUser,
    meta: DocumentSpaceMeta,
    options?: { hd?: boolean },
  ): Promise<MembershipContext> {
    const ctx = await this.resolveContextForDocument(meta, auth);

    if (options?.hd) {
      this.assertFeature(ctx, 'export_hd', '高清导出需要会员权限');
    }

    const limits = quotaLimitsFor(ctx.spaceKind, ctx.effectivePlan);
    if (limits.maxDailyExports == null) return ctx;

    const usage = await this.getUsage(ctx);
    if (usage.dailyExports >= limits.maxDailyExports) {
      throw membershipError(
        'QUOTA_LIMIT',
        ctx.spaceKind === 'personal'
          ? `今日导出次数已达上限（${limits.maxDailyExports} 次），请升级会员`
          : `团队今日导出次数已达上限（${limits.maxDailyExports} 次），请升级团队会员`,
      );
    }

    return ctx;
  }

  async recordExport(ctx: MembershipContext): Promise<void> {
    await this.quotaDailyLogRepository.increment(
      this.spaceKindCode(ctx.spaceKind),
      ctx.spaceId,
      'export',
    );
  }

  async assertCanCreateTeam(auth: AuthUser): Promise<void> {
    if (!this.deployService.canCreateTenant()) {
      throw membershipError('TEAM_CREATE_DENY', '当前部署环境不允许创建团队');
    }

    const user = await this.userRepository.findEntityById(auth.userId);
    if (!user || user.canCreateTeam !== 1) {
      throw membershipError(
        'TEAM_CREATE_DENY',
        '个人账号暂无团队创建权限，请联系管理员或通过受邀方式加入团队',
      );
    }
  }

  async assertCanAddTeamMember(tenantId: string, auth: AuthUser): Promise<void> {
    const ctx = await this.resolveContext({
      ...auth,
      currentIdentityType: 'tenant',
      currentTenantId: tenantId,
    });

    const limits = quotaLimitsFor('team', ctx.effectivePlan);
    if (limits.maxMembers == null) return;

    const count = await this.tenantMemberRepository.countByTenant(tenantId);
    if (count >= limits.maxMembers) {
      throw membershipError(
        'TEAM_MEMBER_LIMIT',
        `团队成员已达上限（${limits.maxMembers} 人），请升级团队会员`,
      );
    }
  }

  assertFeature(
    ctx: MembershipContext,
    feature: MembershipFeatureKey,
    message?: string,
  ): void {
    const enabled = buildFeatureMap(ctx.spaceKind, ctx.effectivePlan)[feature];
    if (!enabled) {
      throw membershipError(
        'VIP_PERMISSION_DENY',
        message ?? '当前版本不支持该功能，请升级会员',
      );
    }
  }

  async applyTeamTrial(tenantId: string): Promise<void> {
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + TRIAL_DAYS_TEAM);
    await this.tenantRepository.updateMembership(tenantId, {
      teamPlan: 3,
      teamVipExpireAt: expireAt,
    });
  }
}
