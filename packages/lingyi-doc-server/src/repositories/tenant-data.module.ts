import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  OrganizationEntity,
  TenantEntity,
  TenantMemberEntity,
  TenantPositionEntity,
  TenantPositionGroupEntity,
  TenantRoleEntity,
} from '../database/entities/tenant.entity';
import { OrganizationRepository } from './organization.repository';
import { PositionRepository } from './position.repository';
import { TenantMemberRepository } from './tenant-member.repository';
import { TenantRepository } from './tenant.repository';
import { TenantRoleRepository } from './tenant-role.repository';

/**
 * Tenant 域数据模块（非 Global）。
 * 需要租户/组织/成员仓储的业务模块必须显式 imports: [TenantDataModule]。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      TenantMemberEntity,
      OrganizationEntity,
      TenantPositionGroupEntity,
      TenantPositionEntity,
      TenantRoleEntity,
    ]),
  ],
  providers: [
    TenantRepository,
    TenantMemberRepository,
    OrganizationRepository,
    PositionRepository,
    TenantRoleRepository,
  ],
  exports: [
    TenantRepository,
    TenantMemberRepository,
    OrganizationRepository,
    PositionRepository,
    TenantRoleRepository,
    TypeOrmModule,
  ],
})
export class TenantDataModule {}
