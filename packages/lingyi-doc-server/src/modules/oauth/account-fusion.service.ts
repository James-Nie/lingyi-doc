import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DeployService } from '../../config/deploy.service';
import { UserRepository } from '../../repositories/user.repository';
import { UserOauthBindingRepository } from '../../repositories/user-oauth-binding.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TRIAL_DAYS_PERSONAL } from '../membership/membership-policy';
import type { DbUser, OAuthProviderCode } from '../../types/database';
import type { OAuthExternalProfile } from './strategies/oauth-provider.interface';

/** 融合结果：可直接登录 / 命中既有账号需二次确认 */
export type FusionOutcome =
  | { kind: 'login'; user: DbUser; isNewUser: boolean; matchedBy: 'binding' | 'created' }
  | { kind: 'needs-confirm'; targetUserId: string; targetDisplayName: string; targetHint: string };

/**
 * 账号融合（扫码登录即注册）
 *
 * 顺序：binding 命中 → 手机号命中 → 邮箱命中 → 新建
 *
 * 安全约束：**手机号/邮箱命中既有本地账号时不做自动合并**。
 * 手机号可能被运营商回收重分配、钉钉通讯录号码可能过时（离职员工），
 * 直接合并会导致账号接管。因此返回 `needs-confirm`，由调用方要求用户
 * 证明自己也是该本地账号的持有者（输入本地账号密码）后再建立绑定。
 */
@Injectable()
export class AccountFusionService {
  private readonly logger = new Logger(AccountFusionService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly bindingRepository: UserOauthBindingRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly deployService: DeployService,
  ) {}

  async resolve(input: {
    provider: OAuthProviderCode;
    providerAppId: string;
    profile: OAuthExternalProfile;
  }): Promise<FusionOutcome> {
    const { provider, providerAppId, profile } = input;

    // 1) 已绑定过该第三方账号 → 直接复用（老用户回归，无需二次确认）
    const existingBinding = await this.bindingRepository.findByIdentity(
      provider,
      providerAppId,
      profile.providerUserId,
    );
    if (existingBinding) {
      const user = await this.userRepository.findById(existingBinding.user_id);
      if (user) {
        await this.bindingRepository.touch(existingBinding.id, profile.raw);
        await this.userRepository.recordOauthLoginSuccess(user.id);
        return { kind: 'login', user, isNewUser: false, matchedBy: 'binding' };
      }
      // 绑定指向的用户已不存在（脏数据），清理后继续
      this.logger.warn(`绑定 ${existingBinding.id} 指向的用户不存在，已清理`);
      await this.bindingRepository.deleteByUserIdAndProvider(existingBinding.user_id, provider);
    }

    // 2) 手机号命中既有本地账号 → 需二次确认，不自动合并
    if (profile.mobile) {
      const byPhone = await this.userRepository.findByPhone(profile.mobile);
      if (byPhone) {
        this.logger.warn(
          `手机号命中既有账号，需二次确认: target=${byPhone.id} provider=${provider}`,
        );
        return {
          kind: 'needs-confirm',
          targetUserId: byPhone.id,
          targetDisplayName: byPhone.display_name,
          targetHint: this.maskPhone(byPhone.phone),
        };
      }
    }

    // 3) 邮箱命中既有本地账号 → 同样需二次确认
    if (profile.email) {
      const byEmail = await this.userRepository.findByEmail(profile.email);
      if (byEmail) {
        this.logger.warn(
          `邮箱命中既有账号，需二次确认: target=${byEmail.id} provider=${provider}`,
        );
        return {
          kind: 'needs-confirm',
          targetUserId: byEmail.id,
          targetDisplayName: byEmail.display_name,
          targetHint: this.maskEmail(byEmail.email),
        };
      }
    }

    // 4) 均未命中 → 即注册（新建账号无需确认）
    const created = await this.createUserWithBinding(provider, providerAppId, profile);
    return { kind: 'login', user: created, isNewUser: true, matchedBy: 'created' };
  }

  /**
   * 用户已通过本地密码验证，正式建立绑定
   * @returns 绑定后的用户
   */
  async confirmBind(input: {
    targetUserId: string;
    provider: OAuthProviderCode;
    providerAppId: string;
    profile: OAuthExternalProfile;
  }): Promise<DbUser> {
    const { targetUserId, provider, providerAppId, profile } = input;

    // 该第三方账号可能已被别人抢先绑定（并发/异常），此处再查一次避免串号
    const occupied = await this.bindingRepository.findByIdentity(
      provider,
      providerAppId,
      profile.providerUserId,
    );
    if (occupied && occupied.user_id !== targetUserId) {
      this.logger.error(
        `第三方账号已被其他用户绑定: binding=${occupied.id} owner=${occupied.user_id} target=${targetUserId}`,
      );
      throw new Error('该第三方账号已绑定到其他账号，无法合并');
    }
    if (!occupied) {
      await this.createBinding(targetUserId, provider, providerAppId, profile);
    }

    await this.userRepository.recordOauthLoginSuccess(targetUserId);
    this.logger.log(`二次确认通过，已完成绑定: user=${targetUserId} provider=${provider}`);
    return this.reload(targetUserId);
  }

  private async createUserWithBinding(
    provider: OAuthProviderCode,
    providerAppId: string,
    profile: OAuthExternalProfile,
  ): Promise<DbUser> {
    const userId = uuidv4();
    const isSaas = this.deployService.isSaas();
    const trialExpire = isSaas
      ? (() => {
        const d = new Date();
        d.setDate(d.getDate() + TRIAL_DAYS_PERSONAL);
        return d;
      })()
      : null;

    const user = await this.userRepository.create({
      id: userId,
      // 钉钉/飞书可能不返回邮箱；此时落 NULL，由 users.email 条件唯一索引容忍
      email: profile.email,
      passwordHash: null,
      displayName: profile.displayName,
      phone: profile.mobile,
      avatarUrl: profile.avatarUrl,
      userType: 'consumer',
      personalPlan: isSaas ? 3 : 1,
      personalVipExpireAt: trialExpire,
      // 渠道来源只在建档时写入，后续绑定不改写
      importedFrom: provider,
    });

    await this.createBinding(user.id, provider, providerAppId, profile);
    await this.userRepository.recordOauthLoginSuccess(user.id);
    await this.tenantMemberRepository.ensurePrivateDefaultMembership(
      user.id,
      this.deployService.defaultUserSource(),
    );

    this.logger.log(`第三方扫码注册新用户: ${user.id} via ${provider}`);
    return this.reload(user.id);
  }

  /** 写绑定；并发下唯一约束冲突则视为他人已绑定 */
  private async createBinding(
    userId: string,
    provider: OAuthProviderCode,
    providerAppId: string,
    profile: OAuthExternalProfile,
  ): Promise<void> {
    try {
      await this.bindingRepository.create({
        id: uuidv4(),
        userId,
        provider,
        providerAppId,
        providerUserId: profile.providerUserId,
        providerUnionId: profile.providerUnionId,
        rawProfile: profile.raw,
      });
    } catch (err) {
      const raced = await this.bindingRepository.findByIdentity(
        provider,
        providerAppId,
        profile.providerUserId,
      );
      if (!raced) throw err;
    }
  }

  private async reload(userId: string): Promise<DbUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('用户不存在');
    return user;
  }

  private maskPhone(phone: string | null): string {
    if (!phone || phone.length < 5) return phone ?? '';
    return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
  }

  private maskEmail(email: string | null): string {
    if (!email) return '';
    const [name, domain] = email.split('@');
    if (!domain) return email;
    const head = name.slice(0, Math.min(3, name.length));
    return `${head}***@${domain}`;
  }
}
