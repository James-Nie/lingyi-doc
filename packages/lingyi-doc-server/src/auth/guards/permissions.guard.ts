import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  type PermissionsMode,
} from '../decorators/require-permissions.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const mode = this.reflector.getAllAndOverride<PermissionsMode>(PERMISSIONS_MODE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? 'all';

    const request = context.switchToHttp().getRequest<{ auth?: AuthUser }>();
    const perms = request.auth?.permissions ?? [];

    const ok = mode === 'any'
      ? required.some(p => perms.includes(p))
      : required.every(p => perms.includes(p));

    if (!ok) {
      throw new BusinessException(110003, '无操作权限', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
