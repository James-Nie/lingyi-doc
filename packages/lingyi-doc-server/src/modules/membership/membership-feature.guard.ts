import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import type { MembershipFeatureKey } from '../../types/membership';
import { MembershipService } from './membership.service';
import { MEMBERSHIP_FEATURES_KEY } from './require-feature.decorator';

@Injectable()
export class MembershipFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membershipService: MembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const features = this.reflector.getAllAndOverride<MembershipFeatureKey[]>(
      MEMBERSHIP_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!features?.length) return true;

    const request = context.switchToHttp().getRequest<{ auth?: AuthUser }>();
    const user = request.auth;
    if (!user) return false;

    const mctx = await this.membershipService.resolveContext(user);
    for (const feature of features) {
      this.membershipService.assertFeature(mctx, feature);
    }
    return true;
  }
}
