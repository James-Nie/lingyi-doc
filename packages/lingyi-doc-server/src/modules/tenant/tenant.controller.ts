import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { DeployService } from '../../config/deploy.service';
import { MembershipService } from '../membership/membership.service';
import { TRIAL_DAYS_TEAM } from '../membership/membership-policy';

@Controller('api/v1/c/tenants')
@UseGuards(JwtAuthGuard)
@AuthAudience('consumer')
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly userRepository: UserRepository,
    private readonly deployService: DeployService,
    private readonly membershipService: MembershipService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    try {
      const tenants = await this.tenantRepository.listForUser(user.userId);
      return {
        items: tenants,
        total: tenants.length,
        allowMultiTenantSwitch: this.deployService.allowMultiTenantSwitch,
        deployType: this.deployService.type,
      };
    } catch (err) {
      this.logger.error('list failed', err);
      throw new BusinessException(100005, '获取租户列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      if (!this.deployService.canCreateTenant()) {
        throw new BusinessException(110003, '当前部署环境不允许创建租户', HttpStatus.FORBIDDEN);
      }

      await this.membershipService.assertCanCreateTeam(user);

      const { name } = body ?? {};
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) {
        throw new BusinessException(100002, '缺少企业名称');
      }

      const dbUser = await this.userRepository.findById(user.userId);
      if (!dbUser) {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }

      const teamTrialExpire = new Date();
      teamTrialExpire.setDate(teamTrialExpire.getDate() + TRIAL_DAYS_TEAM);

      const tenant = await this.tenantRepository.create({
        name: trimmed,
        adminUserId: dbUser.id,
        userSource: dbUser.user_source ?? this.deployService.defaultUserSource(),
        teamPlan: 3,
        teamVipExpireAt: teamTrialExpire,
      });

      return {
        id: tenant.id,
        name: tenant.name,
        tenantRole: 1,
        isAllowMultiSwitch: tenant.is_allow_multi_switch === true,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create failed', err);
      throw new BusinessException(100005, '创建租户失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/organizations')
  async organizations(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string) {
    try {
      const isMember = await this.tenantMemberRepository.isActiveMember(user.userId, tenantId);
      if (!isMember) {
        throw new BusinessException(110003, '无权访问该租户', HttpStatus.FORBIDDEN);
      }

      const tree = await this.organizationRepository.listByTenant(tenantId);
      return { items: tree };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('organizations failed', err);
      throw new BusinessException(100005, '获取组织架构失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/members')
  async members(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string) {
    try {
      const isMember = await this.tenantMemberRepository.isActiveMember(user.userId, tenantId);
      if (!isMember) {
        throw new BusinessException(110003, '无权查看成员列表', HttpStatus.FORBIDDEN);
      }

      const members = await this.tenantMemberRepository.listByTenant(tenantId);
      return { items: members, total: members.length };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('members failed', err);
      throw new BusinessException(100005, '获取成员列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
