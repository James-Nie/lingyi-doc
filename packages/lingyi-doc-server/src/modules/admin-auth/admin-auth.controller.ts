import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminRoleRepository } from '../../repositories/admin-role.repository';
import { AuthSessionRepository } from '../../repositories/auth-session.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { hasTenantBackendPermission } from '../../constants/rbac';
import {
  AuthError,
  AuthHelpersService,
  authErrorStatus,
} from '../../services/auth-helpers.service';
import { AuthService } from '../../services/auth.service';

@Controller('api/v1/admin/auth')
export class AdminAuthController {
  private readonly logger = new Logger(AdminAuthController.name);

  constructor(
    private readonly authHelpers: AuthHelpersService,
    private readonly authService: AuthService,
    private readonly userRepository: UserRepository,
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly adminRoleRepository: AdminRoleRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  @Post('login')
  async login(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const { email, password } = body ?? {};
    if (!email || !password) {
      throw new BusinessException(100002, '缺少必填参数');
    }
    try {
      return await this.authHelpers.loginUser({
        account: String(email),
        password: String(password),
        audience: 'admin',
        req,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        throw new BusinessException(err.code, err.message, authErrorStatus(err.code));
      }
      this.logger.error('login failed', err);
      throw new BusinessException(100005, '登录失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('refresh')
  async refresh(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const { refreshToken } = body ?? {};
    if (!refreshToken) {
      throw new BusinessException(100002, '缺少 refreshToken');
    }

    try {
      const payload = this.authService.verifyRefreshToken(String(refreshToken));
      const session = await this.authSessionRepository.findValid(String(refreshToken), 'consumer');
      if (!session) {
        throw new BusinessException(110002, 'Token 无效或已过期', HttpStatus.UNAUTHORIZED);
      }
      const user = await this.userRepository.findById(payload.sub);
      if (!user) {
        throw new BusinessException(110004, '用户不存在', HttpStatus.UNAUTHORIZED);
      }
      // refresh 重算 roles/permissions，保证权限变更在下一次 refresh 后生效
      const roles = await this.adminRoleRepository.getUserRoles(user.id);
      const platformPermissions = await this.adminRoleRepository.getUserPermissions(user.id);
      const tenantBackendPermissions = await this.tenantRepository.listUserBackendPermissions(user.id);
      const permissions = [...new Set([...platformPermissions, ...tenantBackendPermissions])];
      if (!permissions.length) {
        throw new BusinessException(110003, '无后台管理权限', HttpStatus.FORBIDDEN);
      }
      const result = await this.authHelpers.issueTokens(user, 'admin', req, session.sessionContext ?? undefined);
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        permissions: result.permissions ?? permissions,
        roles: result.roles ?? roles,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      throw new BusinessException(110002, 'Token 无效或已过期', HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('logout')
  async logout(@Body() body: Record<string, unknown>) {
    const { refreshToken } = body ?? {};
    if (refreshToken) {
      await this.authSessionRepository.revoke(String(refreshToken));
    }
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AuthAudience('admin')
  async me(@CurrentUser() user: AuthUser) {
    const dbUser = await this.userRepository.findById(user.userId);
    if (!dbUser) {
      throw new BusinessException(110004, '用户不存在', HttpStatus.UNAUTHORIZED);
    }
    const roles = await this.adminRoleRepository.getUserRoles(dbUser.id);
    const platformPermissions = await this.adminRoleRepository.getUserPermissions(dbUser.id);
    const tenants = await this.tenantRepository.listForUser(dbUser.id);
    const tenantBackendPermissions = await this.tenantRepository.listUserBackendPermissions(dbUser.id);
    const permissions = [...new Set([...platformPermissions, ...tenantBackendPermissions])];
    return {
      ...this.userRepository.toPublicUser(dbUser),
      roles,
      permissions,
      tenantAdmins: tenants
        .filter(t => t.tenantRole === 2 || hasTenantBackendPermission(t.permissions))
        .map(t => ({
          tenantId: t.id,
          tenantName: t.name,
          tenantRole: t.tenantRole,
          permissions: hasTenantBackendPermission(t.permissions) ? (t.permissions ?? []) : [],
        })),
    };
  }
}
