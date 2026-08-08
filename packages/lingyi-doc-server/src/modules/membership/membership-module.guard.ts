import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import type { MembershipModuleKey } from '../../types/membership';
import { MembershipService } from './membership.service';
import { MEMBERSHIP_MODULES_KEY } from './require-module.decorator';

@Injectable()
export class MembershipModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membershipService: MembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const modules = this.reflector.getAllAndOverride<MembershipModuleKey[]>(
      MEMBERSHIP_MODULES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!modules?.length) return true;

    const request = context.switchToHttp().getRequest<{ auth?: AuthUser }>();
    const user = request.auth;
    if (!user) return false;

    const mctx = await this.membershipService.resolveContext(user);
    for (const module of modules) {
      this.membershipService.assertModule(mctx, module);
    }
    return true;
  }
}
