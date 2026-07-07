import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthService } from '../../services/auth.service';
import { DeployService } from '../../config/deploy.service';
import {
  AUTH_AUDIENCE_KEY,
  type TokenAudience,
} from '../decorators/auth-audience.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly deployService: DeployService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const audience = this.reflector.getAllAndOverride<TokenAudience>(AUTH_AUDIENCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? 'consumer';

    const request = context.switchToHttp().getRequest<{ auth?: AuthUser; headers: { authorization?: string } }>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new BusinessException(110001, '未登录', HttpStatus.UNAUTHORIZED);
    }

    try {
      const token = authHeader.slice(7);
      const payload = this.authService.verifyAccessToken(token, audience);
      if (audience === 'consumer') {
        request.auth = {
          userId: payload.sub,
          email: payload.email,
          userType: payload.userType,
          userSource: payload.userSource,
          audience: 'consumer',
          currentIdentityType: payload.currentIdentityType ?? 'personal',
          currentTenantId: payload.currentTenantId ?? null,
          tenantRole: payload.tenantRole ?? null,
          deployType: payload.deployType ?? this.deployService.type,
          accountMode: payload.accountMode ?? this.deployService.accountMode,
        };
      } else {
        request.auth = {
          userId: payload.sub,
          email: payload.email,
          userType: payload.userType,
          audience: 'admin',
          roles: payload.roles,
          permissions: payload.permissions,
        };
      }
      return true;
    } catch {
      throw new BusinessException(110002, 'Token 无效或已过期', HttpStatus.UNAUTHORIZED);
    }
  }
}
