export { UserEntity } from './user.entity';
export { DocumentEntity } from './document.entity';
export { DocumentSnapshotEntity } from './document-snapshot.entity';
export { CrdtOplogEntity } from './crdt-oplog.entity';
export { DocumentSheetEntity } from './document-sheet.entity';
export { BaseTableEntity, BaseRecordEntity, BaseViewEntity } from './base.entity';
export { TenantEntity, TenantMemberEntity, OrganizationEntity } from './tenant.entity';
export {
  SchemaMigrationEntity,
  AdminRoleEntity,
  AdminPermissionEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
} from './admin.entity';
export {
  AuditLogEntity,
  SystemConfigEntity,
  AuthSessionEntity,
  DemoRequestEntity,
} from './misc.entity';
export {
  KnowledgeBaseEntity,
  KbNodeEntity,
  KbMemberEntity,
} from './knowledge-base.entity';
export {
  DocShareEntity,
  DocShareUserEntity,
  DocShareJoinRequestEntity,
  DocShareVisitLogEntity,
  DocShareAuditLogEntity,
} from './document-share.entity';
export { DocTemplateEntity } from './doc-template.entity';

import { UserEntity } from './user.entity';
import { DocumentEntity } from './document.entity';
import { DocumentSnapshotEntity } from './document-snapshot.entity';
import { CrdtOplogEntity } from './crdt-oplog.entity';
import { DocumentSheetEntity } from './document-sheet.entity';
import { BaseTableEntity, BaseRecordEntity, BaseViewEntity } from './base.entity';
import { TenantEntity, TenantMemberEntity, OrganizationEntity } from './tenant.entity';
import {
  SchemaMigrationEntity,
  AdminRoleEntity,
  AdminPermissionEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
} from './admin.entity';
import {
  AuditLogEntity,
  SystemConfigEntity,
  AuthSessionEntity,
  DemoRequestEntity,
} from './misc.entity';
import {
  KnowledgeBaseEntity,
  KbNodeEntity,
  KbMemberEntity,
} from './knowledge-base.entity';
import {
  DocShareEntity,
  DocShareUserEntity,
  DocShareJoinRequestEntity,
  DocShareVisitLogEntity,
  DocShareAuditLogEntity,
} from './document-share.entity';
import { DocTemplateEntity } from './doc-template.entity';

/** 与现有 MySQL schema 对应的全部 TypeORM 实体 */
export const ALL_ENTITIES = [
  UserEntity,
  DocumentEntity,
  DocumentSnapshotEntity,
  CrdtOplogEntity,
  DocumentSheetEntity,
  BaseTableEntity,
  BaseRecordEntity,
  BaseViewEntity,
  TenantEntity,
  TenantMemberEntity,
  OrganizationEntity,
  SchemaMigrationEntity,
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
