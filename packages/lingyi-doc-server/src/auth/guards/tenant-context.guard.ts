import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { DeployService } from '../../config/deploy.service';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly deployService: DeployService,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ auth?: AuthUser }>();
    const auth = request.auth;
    if (!auth) {
      throw new BusinessException(110001, '未登录', HttpStatus.UNAUTHORIZED);
    }

    if (auth.currentIdentityType !== 'tenant' || !auth.currentTenantId) {
      return true;
    }

    const tenantId = auth.currentTenantId;

    if (this.deployService.isPrivate()) {
      const defaultId = this.deployService.defaultTenantId;
      if (defaultId && tenantId !== defaultId) {
        throw new BusinessException(110003, '无权访问该租户', HttpStatus.FORBIDDEN);
      }
      const onlyTenant = await this.tenantRepository.ensureDefaultPrivateTenant();
      if (onlyTenant && tenantId !== onlyTenant.id) {
        throw new BusinessException(110003, '无权访问该租户', HttpStatus.FORBIDDEN);
      }
    }

    const isMember = await this.tenantMemberRepository.isActiveMember(auth.userId, tenantId);
    if (!isMember) {
      throw new BusinessException(110003, '您不是该租户成员', HttpStatus.FORBIDDEN);
    }

    return true;
  }
}
