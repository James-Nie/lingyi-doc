import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserOauthBindingEntity } from '../database/entities/user-oauth-binding.entity';
import type { DbUserOauthBinding, OAuthProviderCode } from '../types/database';

function toDbBinding(entity: UserOauthBindingEntity): DbUserOauthBinding {
  return {
    id: entity.id,
    user_id: entity.userId,
    provider: entity.provider as OAuthProviderCode,
    provider_app_id: entity.providerAppId,
    provider_user_id: entity.providerUserId,
    provider_union_id: entity.providerUnionId,
    raw_profile: entity.rawProfile,
    bound_at: entity.boundAt,
    last_used_at: entity.lastUsedAt,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
  };
}

@Injectable()
export class UserOauthBindingRepository {
  constructor(
    @InjectRepository(UserOauthBindingEntity)
    private readonly repo: Repository<UserOauthBindingEntity>,
  ) {}

  /** 按第三方身份精确查找绑定（登录主路径） */
  async findByIdentity(
    provider: OAuthProviderCode,
    providerAppId: string,
    providerUserId: string,
  ): Promise<DbUserOauthBinding | null> {
    const entity = await this.repo.findOne({
      where: { provider, providerAppId, providerUserId },
    });
    return entity ? toDbBinding(entity) : null;
  }

  async listByUserId(userId: string): Promise<DbUserOauthBinding[]> {
    const rows = await this.repo.find({ where: { userId }, order: { boundAt: 'ASC' } });
    return rows.map(toDbBinding);
  }

  async findByUserIdAndProvider(
    userId: string,
    provider: OAuthProviderCode,
  ): Promise<DbUserOauthBinding | null> {
    const entity = await this.repo.findOne({ where: { userId, provider } });
    return entity ? toDbBinding(entity) : null;
  }

  async create(input: {
    id: string;
    userId: string;
    provider: OAuthProviderCode;
    providerAppId: string;
    providerUserId: string;
    providerUnionId?: string | null;
    rawProfile?: Record<string, unknown> | null;
  }): Promise<DbUserOauthBinding> {
    await this.repo.save({
      id: input.id,
      userId: input.userId,
      provider: input.provider,
      providerAppId: input.providerAppId,
      providerUserId: input.providerUserId,
      providerUnionId: input.providerUnionId ?? null,
      rawProfile: input.rawProfile ?? null,
      boundAt: new Date(),
      lastUsedAt: null,
    });
    const created = await this.repo.findOne({ where: { id: input.id } });
    if (!created) throw new Error('创建第三方绑定失败');
    return toDbBinding(created);
  }

  /** 登录命中已有绑定时刷新使用时间与画像 */
  async touch(id: string, rawProfile?: Record<string, unknown> | null): Promise<void> {
    const patch: Partial<UserOauthBindingEntity> = { lastUsedAt: new Date() };
    if (rawProfile !== undefined) patch.rawProfile = rawProfile;
    await this.repo.update(
      id,
      patch as Parameters<Repository<UserOauthBindingEntity>['update']>[1],
    );
  }

  async deleteByUserIdAndProvider(userId: string, provider: OAuthProviderCode): Promise<void> {
    await this.repo.delete({ userId, provider });
  }

  async countByUserId(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }
}
