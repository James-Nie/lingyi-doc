import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeployService } from '../config/deploy.service';
import {
  AdminPermissionEntity,
  AdminRoleEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
} from '../database/entities/admin.entity';
import { DocumentEntity } from '../database/entities/document.entity';
import { DocumentSnapshotEntity } from '../database/entities/document-snapshot.entity';
import {
  AuditLogEntity,
  AuthSessionEntity,
  DemoRequestEntity,
  SystemConfigEntity,
} from '../database/entities/misc.entity';
import {
  OrganizationEntity,
  TenantEntity,
  TenantMemberEntity,
} from '../database/entities/tenant.entity';
import {
  KbMemberEntity,
  KbNodeEntity,
  KnowledgeBaseEntity,
} from '../database/entities/knowledge-base.entity';
import {
  DocShareAuditLogEntity,
  DocShareEntity,
  DocShareJoinRequestEntity,
  DocShareUserEntity,
  DocShareVisitLogEntity,
} from '../database/entities/document-share.entity';
import { DocTemplateEntity } from '../database/entities/doc-template.entity';
import { UserEntity } from '../database/entities/user.entity';
import { AdminRoleRepository } from './admin-role.repository';
import { AuditLogRepository } from './audit-log.repository';
import { AuthSessionRepository } from './auth-session.repository';
import { DemoRequestRepository } from './demo-request.repository';
import { DocumentRepository } from './document.repository';
import { OrganizationRepository } from './organization.repository';
import { SystemConfigRepository } from './system-config.repository';
import { TenantMemberRepository } from './tenant-member.repository';
import { TenantRepository } from './tenant.repository';
import { KnowledgeBaseRepository } from './knowledge-base.repository';
import { KbNodeRepository } from './kb-node.repository';
import { DocumentShareRepository } from './document-share.repository';
import { DocTemplateRepository } from './doc-template.repository';
import { UserRepository } from './user.repository';
import { AuthHelpersService } from '../services/auth-helpers.service';
import { AuthService } from '../services/auth.service';
import { OssService } from '../services/oss.service';
import { SessionService } from '../services/session.service';
import { DashboardService } from '../services/dashboard.service';
import { StorageService } from '../services/storage.service';
import { DocPathService } from '../services/doc-path.service';
import { AliyunSmsService } from '../services/aliyun-sms.service';
import { PasswordCryptoService } from '../services/password-crypto.service';
import { RateLimitService } from '../services/rate-limit.service';
import { SmsVerificationService } from '../services/sms-verification.service';

const ENTITIES = [
  UserEntity,
  DocumentEntity,
  DocumentSnapshotEntity,
  TenantEntity,
  TenantMemberEntity,
  OrganizationEntity,
  AdminRoleEntity,
  AdminPermissionEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
  AuditLogEntity,
  SystemConfigEntity,
  AuthSessionEntity,
  DemoRequestEntity,
  KnowledgeBaseEntity,
  KbNodeEntity,
  KbMemberEntity,
  DocShareEntity,
  DocShareUserEntity,
  DocShareJoinRequestEntity,
  DocShareVisitLogEntity,
  DocShareAuditLogEntity,
  DocTemplateEntity,
];

const REPOSITORIES = [
  UserRepository,
  AuthSessionRepository,
  DocumentRepository,
  TenantRepository,
  TenantMemberRepository,
  OrganizationRepository,
  AdminRoleRepository,
  AuditLogRepository,
  SystemConfigRepository,
  DemoRequestRepository,
  KnowledgeBaseRepository,
  KbNodeRepository,
  DocumentShareRepository,
  DocTemplateRepository,
];

const SERVICES = [
  DeployService,
  AuthService,
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
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [...REPOSITORIES, ...SERVICES],
  exports: [...REPOSITORIES, ...SERVICES],
})
export class RepositoriesModule {}
