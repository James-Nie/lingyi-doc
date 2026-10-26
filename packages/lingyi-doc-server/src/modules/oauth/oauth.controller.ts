import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OAuthService } from './oauth.service';
import { OAuthError } from './strategies/oauth-provider.interface';

@Controller('api/v1/c/auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly config: ConfigService,
  ) {}

  /** 登录页渲染第三方按钮用 */
  @Get('providers')
  listProviders() {
    return { items: this.oauthService.listProviders() };
  }

  /** 当前用户已绑定的第三方渠道 */
  @Get('bindings')
  @UseGuards(JwtAuthGuard)
  @AuthAudience('consumer')
  async listBindings(@CurrentUser() user: AuthUser) {
    return { items: await this.oauthService.listBindings(user.userId) };
  }

  /**
   * 二次确认合并：手机号/邮箱命中既有账号时，用户输入该账号密码以证明所有权。
   * 仅在用户本人持有本地账号时才会通过，避免手机号撞库导致的账号接管。
   */
  @Post('bind-confirm')
  async bindConfirm(
    @Body() body: { pendingToken?: string; password?: string },
    @Req() req: Request,
  ) {
    try {
      const result = await this.oauthService.confirmPendingBind({
        pendingToken: String(body?.pendingToken ?? ''),
        encryptedPassword: String(body?.password ?? ''),
        req,
      });
      return {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        user: result.tokens.user,
        session: result.tokens.session,
        tenants: result.tokens.tenants,
      };
    } catch (err) {
      if (err instanceof OAuthError) {
        throw new BusinessException(err.code, err.message, err.httpStatus as HttpStatus);
      }
      throw err;
    }
  }

  /** 发起扫码登录：302 跳转到第三方授权页 */
  @Get(':provider/start')
  async start(
    @Param('provider') provider: string,
    @Query('redirect') redirect: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { authorizeUrl } = await this.oauthService.startLogin({ provider, redirect, req });
      res.redirect(302, authorizeUrl);
    } catch (err) {
      // 起点失败也回前端，避免浏览器直接看到 JSON 报错页
      res.redirect(302, this.buildErrorRedirect(err));
    }
  }

  /** 第三方回调：换令牌、即注册、签发 JWT，再 302 回前端 */
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.oauthService.handleCallback({ provider, code, state, req });
      res.redirect(302, result.redirectUrl);
    } catch (err) {
      res.redirect(302, this.buildErrorRedirect(err));
    }
  }

  private buildErrorRedirect(err: unknown): string {
    const webBase = this.config.get<string>('oauth.webBaseUrl', '').replace(/\/$/, '');
    const message = err instanceof OAuthError ? err.message : '第三方登录失败，请稍后重试';
    const params = new URLSearchParams({ error: message });
    return `${webBase}/oauth/callback#${params.toString()}`;
  }
}
