import { Injectable, HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class ConsumerTenantService {
  constructor(
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  /** 当前用户待确认的组织邀请列表 */
  async listInvitations(userId: string) {
    const pending = await this.tenantMemberRepository.listPendingInvitations(userId);
    const items = [];
    for (const member of pending) {
      if (!member.tenantId) continue;
      const tenant = await this.tenantRepository.findById(member.tenantId);
      items.push({
        tenantId: member.tenantId,
        tenantName: tenant?.name ?? '未知组织',
        tenantRole: member.tenantRole,
        status: member.status,
        invitedAt: member.joinedAt,
      });
    }
    return { items };
  }

  /** 接受组织邀请：status 0 → 1 */
  async acceptInvitation(userId: string, tenantId: string) {
    const pending = await this.tenantMemberRepository.listPendingInvitations(userId);
    const match = pending.find(m => m.tenantId === tenantId);
    if (!match) {
      throw new BusinessException(110003, '您没有待确认的该组织邀请', HttpStatus.FORBIDDEN);
    }
    await this.tenantMemberRepository.updateMember(tenantId, userId, { status: 1 });
    return { success: true };
  }

  /** 拒绝组织邀请：删除待确认记录 */
  async rejectInvitation(userId: string, tenantId: string) {
    const pending = await this.tenantMemberRepository.listPendingInvitations(userId);
    const match = pending.find(m => m.tenantId === tenantId);
    if (!match) {
      throw new BusinessException(110003, '您没有待确认的该组织邀请', HttpStatus.FORBIDDEN);
    }
    await this.tenantMemberRepository.deleteMember(tenantId, userId);
    return { success: true };
  }
}
