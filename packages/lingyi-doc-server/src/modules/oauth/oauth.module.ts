import { Module } from '@nestjs/common';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { AccountFusionService } from './account-fusion.service';
import { DingTalkStrategy } from './strategies/dingtalk.strategy';
import { FeishuStrategy } from './strategies/feishu.strategy';

/**
 * 第三方扫码登录（钉钉 / 飞书）
 * 依赖全局的 RepositoriesModule（UserRepository / UserOauthBindingRepository / 认证服务）
 * 与 RedisModule（state 存储）；TenantDataModule 需显式引入。
 */
@Module({
  imports: [TenantDataModule],
  controllers: [OAuthController],
  providers: [
    OAuthService,
    OAuthStateService,
    AccountFusionService,
    DingTalkStrategy,
    FeishuStrategy,
  ],
  exports: [OAuthService],
})
export class OAuthModule {}
