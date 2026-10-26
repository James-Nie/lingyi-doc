import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AdminPermissionEntity,
  AdminRoleEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
} from '../database/entities/admin.entity';
import {
  AuditLogEntity,
  AuthSessionEntity,
  DemoRequestEntity,
  SystemConfigEntity,
} from '../database/entities/misc.entity';
import {
  DocShareAuditLogEntity,
  DocShareEntity,
  DocShareJoinRequestEntity,
  DocShareUserEntity,
  DocShareVisitLogEntity,
} from '../database/entities/document-share.entity';
import { DocTemplateEntity } from '../database/entities/doc-template.entity';
import { DocUserVisitEntity } from '../database/entities/doc-user-visit.entity';
import { UserEntity } from '../database/entities/user.entity';
import { UserOauthBindingEntity } from '../database/entities/user-oauth-binding.entity';
import {
  AdminGroupEntity,
  AdminGroupMemberEntity,
  AdminGroupOrgEntity,
  AdminGroupRoleEntity,
  TenantSecurityPolicyEntity,
} from '../database/entities/admin-console.entity';
import { OrganizationEntity } from '../database/entities/tenant.entity';
import { AdminAccessRepository } from './admin-access.repository';
import { AdminDocumentRepository } from './admin-document.repository';
import { AdminGroupRepository } from './admin-group.repository';
import { AdminRoleRepository } from './admin-role.repository';
import { AuditLogRepository } from './audit-log.repository';
import { AuthSessionRepository } from './auth-session.repository';
import { DemoRequestRepository } from './demo-request.repository';
import { DocumentDataModule } from './document-data.module';
import { TenantDataModule } from './tenant-data.module';
import { KnowledgeDataModule } from './knowledge-data.module';
import { SystemConfigRepository } from './system-config.repository';
import { TenantSecurityPolicyRepository } from './tenant-security-policy.repository';
import { DocumentShareRepository } from './document-share.repository';
import { DocTemplateRepository } from './doc-template.repository';
import { UserRepository } from './user.repository';
import { UserOauthBindingRepository } from './user-oauth-binding.repository';
import { AuthHelpersService } from '../services/auth-helpers.service';
import { AuthService } from '../services/auth.service';
import { AuditWriterService } from '../services/audit-writer.service';
import { OssService } from '../services/oss.service';
import { SessionService } from '../services/session.service';
import { DashboardService } from '../services/dashboard.service';
import { StorageService } from '../services/storage.service';
import { DocPathService } from '../services/doc-path.service';
import { AliyunSmsService } from '../services/aliyun-sms.service';
import { PasswordCryptoService } from '../services/password-crypto.service';
import { RateLimitService } from '../services/rate-limit.service';
import { SmsVerificationService } from '../services/sms-verification.service';

/**
 * 仍为 @Global() 的过渡模块。
 * Document / Tenant / Knowledge 仓储已迁出至 *DataModule；
 * 本模块不再导出它们（Knowledge 仅 import 供可能的共享服务使用时可加）。
 */
const ENTITIES = [
  UserEntity,
  UserOauthBindingEntity,
  AdminRoleEntity,
  AdminPermissionEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
  AuditLogEntity,
  SystemConfigEntity,
  AuthSessionEntity,
  DemoRequestEntity,
  DocShareEntity,
  DocShareUserEntity,
  DocShareJoinRequestEntity,
  DocShareVisitLogEntity,
  DocShareAuditLogEntity,
  DocTemplateEntity,
  DocUserVisitEntity,
  TenantSecurityPolicyEntity,
  AdminGroupEntity,
  AdminGroupRoleEntity,
  AdminGroupMemberEntity,
  AdminGroupOrgEntity,
  OrganizationEntity,
];

const REPOSITORIES = [
  UserRepository,
  UserOauthBindingRepository,
  AuthSessionRepository,
  AdminRoleRepository,
  AdminAccessRepository,
  AdminGroupRepository,
  AdminDocumentRepository,
  AuditLogRepository,
  SystemConfigRepository,
  TenantSecurityPolicyRepository,
  DemoRequestRepository,
  DocumentShareRepository,
  DocTemplateRepository,
];

const SERVICES = [
  AuthService,
  AuditWriterService,
  SessionService,
  AuthHelpersService,
  StorageService,
  DashboardService,
  OssService,
  DocPathService,
  AliyunSmsService,
  PasswordCryptoService,
  RateLimitService,
  SmsVerificationService,
];

@Global()
@Module({
  imports: [
    DocumentDataModule,
    TenantDataModule,
    KnowledgeDataModule,
    TypeOrmModule.forFeature(ENTITIES),
  ],
  providers: [...REPOSITORIES, ...SERVICES],
  exports: [...REPOSITORIES, ...SERVICES],
})
export class RepositoriesModule {}
