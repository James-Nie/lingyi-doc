import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { DeployService } from '../config/deploy.service';
import { planLabel, resolveEffectivePlan, storedPlanLabel } from '../modules/membership/membership-policy';
import type { MembershipPlanCode } from '../types/membership';
import type { AdminConsumerUser, DbUser, PublicUser, UserSource, UserStatus, UserType } from '../types/database';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toDbUser(entity: UserEntity): DbUser {
  return {
    id: entity.id,
    email: entity.email,
    password_hash: entity.passwordHash,
    display_name: entity.displayName,
    avatar_url: entity.avatarUrl,
    phone: entity.phone,
    oauth_union_id: entity.oauthUnionId,
    ldap_uuid: entity.ldapUuid,
    personal_setting: entity.personalSetting,
    locale: entity.locale,
    is_active: entity.isActive,
    user_type: entity.userType as UserType,
    user_source: entity.userSource as UserSource,
    status: entity.status as UserStatus,
    last_login_at: entity.lastLoginAt,
    login_fail_count: entity.loginFailCount,
    locked_until: entity.lockedUntil,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
  };
}

function toPublicUser(user: DbUser, defaultUserSource: UserSource): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url ?? null,
    userType: user.user_type,
    userSource: (user.user_source ?? defaultUserSource) as UserSource,
    status: user.status,
    createdAt: user.created_at instanceof Date ? user.created_at.getTime() : new Date(user.created_at).getTime(),
    lastLoginAt: user.last_login_at
      ? (user.last_login_at instanceof Date ? user.last_login_at.getTime() : new Date(user.last_login_at).getTime())
      : null,
  };
}

function toAdminConsumerUser(entity: UserEntity, defaultUserSource: UserSource): AdminConsumerUser {
  const base = toPublicUser(toDbUser(entity), defaultUserSource);
  const personalPlan = (entity.personalPlan ?? 1) as MembershipPlanCode;
  const expireAt = entity.personalVipExpireAt ?? null;
  const { plan, expired } = resolveEffectivePlan(personalPlan, expireAt);
  return {
    ...base,
    personalPlan,
    effectivePlan: plan,
    planLabel: expired && personalPlan !== 1
      ? `${storedPlanLabel(personalPlan)}（已过期）`
      : planLabel('personal', plan),
    planExpired: expired,
    vipExpireAt: expireAt
      ? (expireAt instanceof Date ? expireAt.getTime() : new Date(expireAt).getTime())
      : null,
  };
}

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
    private readonly deployService: DeployService,
  ) {}

  async findByEmail(email: string): Promise<DbUser | null> {
    // 等值匹配走 uk_users_email；调用方/入库统一小写，禁止 LOWER() 包列
    const entity = await this.repo.findOne({
      where: { email: normalizeEmail(email) },
    });
    return entity ? toDbUser(entity) : null;
  }

  async findByIds(ids: string[]): Promise<DbUser[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const entities = await this.repo.findBy({ id: In(unique) });
    return entities.map(toDbUser);
  }

  /** C 端按名称/邮箱/手机号搜索活跃消费者（优先走索引，避免双侧通配全表扫） */
  async searchPublic(keyword: string, limit = 20): Promise<DbUser[]> {
    const raw = keyword.trim();
    if (!raw) return [];
    const take = Math.min(Math.max(limit, 1), 50);
    const qb = this.repo
      .createQueryBuilder('u')
      .where('u.userType = :userType', { userType: 'consumer' })
      .andWhere('u.status = :status', { status: 'active' });

    if (raw.includes('@')) {
      qb.andWhere('u.email = :email', { email: normalizeEmail(raw) });
    } else if (/^\d{5,}$/.test(raw.replace(/[\s-]/g, ''))) {
      qb.andWhere('u.phone = :phone', { phone: raw.replace(/[\s-]/g, '') });
    } else {
      // 前缀匹配可用到 display_name 索引（若存在）；避免 '%x%' 强制全表扫
      qb.andWhere(
        '(u.displayName LIKE :prefix OR u.email LIKE :prefix OR u.phone LIKE :prefix)',
        { prefix: `${raw}%` },
      );
    }

    const rows = await qb.orderBy('u.displayName', 'ASC').take(take).getMany();
    return rows.map(toDbUser);
  }

  async findByPhone(phone: string): Promise<DbUser | null> {
    const entity = await this.repo.findOne({ where: { phone } });
    return entity ? toDbUser(entity) : null;
  }

  async findById(id: string): Promise<DbUser | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? toDbUser(entity) : null;
  }

  async findEntityById(id: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(input: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    phone?: string | null;
    userType?: UserType;
    userSource?: UserSource;
    personalPlan?: number;
    personalVipExpireAt?: Date | null;
  }): Promise<DbUser> {
    const userType = input.userType ?? 'consumer';
    const userSource = input.userSource ?? this.deployService.defaultUserSource();
    await this.repo.save({
      id: input.id,
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      phone: input.phone ?? null,
      userType,
      userSource,
      personalPlan: input.personalPlan ?? 1,
      personalVipExpireAt: input.personalVipExpireAt ?? null,
      canCreateTeam: 0,
    });
    const user = await this.findById(input.id);
    if (!user) throw new Error('创建用户失败');
    return user;
  }

  async updateProfile(
    id: string,
    patch: { displayName?: string; avatarUrl?: string | null },
  ): Promise<DbUser | null> {
    const updates: Partial<UserEntity> = {};
    if (patch.displayName != null) updates.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) updates.avatarUrl = patch.avatarUrl;
    if (Object.keys(updates).length === 0) return this.findById(id);
    await this.repo.update(id, updates as Parameters<Repository<UserEntity>['update']>[1]);
    return this.findById(id);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.repo.update(id, { passwordHash });
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await this.repo.update(id, { status });
  }

  async updateUserType(id: string, userType: UserType): Promise<void> {
    await this.repo.update(id, { userType });
  }

  async recordLoginSuccess(id: string): Promise<void> {
    await this.repo.update(id, {
      lastLoginAt: new Date(),
      loginFailCount: 0,
      lockedUntil: null,
    });
  }

  async clearExpiredLoginLock(id: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(UserEntity)
      .set({ loginFailCount: 0, lockedUntil: null })
      .where('id = :id', { id })
      .andWhere('lockedUntil IS NOT NULL')
      .andWhere('lockedUntil <= :now', { now: new Date() })
      .execute();
  }

  async clearLoginLock(id: string): Promise<void> {
    await this.repo.update(id, { loginFailCount: 0, lockedUntil: null });
  }

  async recordLoginFailure(id: string, maxAttempts: number, lockMinutes: number): Promise<void> {
    await this.clearExpiredLoginLock(id);
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return;
    const nextCount = entity.loginFailCount + 1;
    const lockedUntil = nextCount >= maxAttempts
      ? new Date(Date.now() + lockMinutes * 60_000)
      : null;
    await this.repo.update(id, { loginFailCount: nextCount, lockedUntil });
  }

  async listByType(
    userType: UserType,
    options: { keyword?: string; status?: UserStatus; limit?: number; offset?: number } = {},
  ): Promise<{ items: PublicUser[]; total: number }> {
    const qb = this.repo.createQueryBuilder('u').where('u.userType = :userType', { userType });

    if (options.keyword) {
      const raw = options.keyword.trim();
      if (raw.includes('@')) {
        qb.andWhere('u.email = :email', { email: raw.toLowerCase() });
      } else {
        qb.andWhere('(u.email LIKE :prefix OR u.displayName LIKE :prefix)', {
          prefix: `${raw}%`,
        });
      }
    }
    if (options.status) {
      qb.andWhere('u.status = :status', { status: options.status });
    }

    const total = await qb.getCount();
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const rows = await qb.orderBy('u.createdAt', 'DESC').skip(offset).take(limit).getMany();
    const defaultSource = this.deployService.defaultUserSource();
    const items = userType === 'consumer'
      ? rows.map((r) => toAdminConsumerUser(r, defaultSource))
      : rows.map((r) => toPublicUser(toDbUser(r), defaultSource));
    return { items, total };
  }

  async countByType(userType: UserType): Promise<number> {
    return this.repo.count({ where: { userType } });
  }

  async countActiveConsumers(sinceDays = 7): Promise<number> {
    const since = new Date(Date.now() - sinceDays * 86_400_000);
    return this.repo
      .createQueryBuilder('u')
      .where('u.userType = :userType', { userType: 'consumer' })
      .andWhere('u.status = :status', { status: 'active' })
      .andWhere('u.lastLoginAt >= :since', { since })
      .getCount();
  }

  async countConsumersCreatedBefore(end: Date): Promise<number> {
    return this.repo
      .createQueryBuilder('u')
      .where('u.userType = :userType', { userType: 'consumer' })
      .andWhere('u.createdAt <= :end', { end })
      .getCount();
  }

  /** 区间内每日新建消费者数（用于趋势回推，避免按天重复 COUNT） */
  async countConsumersCreatedByDay(since: Date, until: Date): Promise<Map<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('u')
      .select("DATE_FORMAT(u.createdAt, '%Y-%m-%d')", 'day')
      .addSelect('COUNT(*)', 'cnt')
      .where('u.userType = :userType', { userType: 'consumer' })
      .andWhere('u.createdAt >= :since', { since })
      .andWhere('u.createdAt <= :until', { until })
      .groupBy("DATE_FORMAT(u.createdAt, '%Y-%m-%d')")
      .getRawMany<{ day: string; cnt: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(String(row.day).slice(0, 10), Number(row.cnt));
    }
    return map;
  }

  async countDailyActiveConsumers(since: Date, until: Date): Promise<Map<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('u')
      .select("DATE_FORMAT(u.lastLoginAt, '%Y-%m-%d')", 'day')
      .addSelect('COUNT(*)', 'cnt')
      .where('u.userType = :userType', { userType: 'consumer' })
      .andWhere('u.lastLoginAt >= :since', { since })
      .andWhere('u.lastLoginAt <= :until', { until })
      .groupBy("DATE_FORMAT(u.lastLoginAt, '%Y-%m-%d')")
      .getRawMany<{ day: string | Date; cnt: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      const key = row.day instanceof Date
        ? `${row.day.getFullYear()}-${String(row.day.getMonth() + 1).padStart(2, '0')}-${String(row.day.getDate()).padStart(2, '0')}`
        : String(row.day).slice(0, 10);
      map.set(key, Number(row.cnt));
    }
    return map;
  }

  toPublicUser(user: DbUser): PublicUser {
    return toPublicUser(user, this.deployService.defaultUserSource());
  }
}
