export { UserEntity } from './user.entity';
export { DocumentEntity } from './document.entity';
export { DocumentContentEntity } from './document-content.entity';
export { DocumentSnapshotEntity } from './document-snapshot.entity';
export { CrdtOplogEntity } from './crdt-oplog.entity';
export { RecordChangeHistoryEntity } from './record-change-history.entity';
export { DocumentSheetEntity } from './document-sheet.entity';
export { BaseTableEntity, BaseRecordEntity, BaseViewEntity, BaseDashboardEntity, BaseDashboardPrefsEntity } from './base.entity';
export { TenantEntity, TenantMemberEntity, OrganizationEntity, TenantPositionGroupEntity, TenantPositionEntity, TenantRoleEntity } from './tenant.entity';
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
export { DocCommentThreadEntity, DocCommentReplyEntity, DocCommentReplyLikeEntity } from './document-comment.entity';
export { DocUserVisitEntity } from './doc-user-visit.entity';
export { QuotaDailyLogEntity } from './quota-daily-log.entity';
export { AI_ENTITIES } from '../../modules/ai/entities';
export { MCP_ENTITIES } from '../../modules/mcp/entities';

import { UserEntity } from './user.entity';
import { DocumentEntity } from './document.entity';
import { DocumentContentEntity } from './document-content.entity';
import { DocumentSnapshotEntity } from './document-snapshot.entity';
import { CrdtOplogEntity } from './crdt-oplog.entity';
import { RecordChangeHistoryEntity } from './record-change-history.entity';
import { DocumentSheetEntity } from './document-sheet.entity';
import { BaseTableEntity, BaseRecordEntity, BaseViewEntity, BaseDashboardEntity, BaseDashboardPrefsEntity } from './base.entity';
import { TenantEntity, TenantMemberEntity, OrganizationEntity, TenantPositionGroupEntity, TenantPositionEntity, TenantRoleEntity } from './tenant.entity';
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
import { DocCommentReplyEntity, DocCommentReplyLikeEntity, DocCommentThreadEntity } from './document-comment.entity';
import { DocUserVisitEntity } from './doc-user-visit.entity';
import { QuotaDailyLogEntity } from './quota-daily-log.entity';
import { AI_ENTITIES } from '../../modules/ai/entities';
import { MCP_ENTITIES } from '../../modules/mcp/entities';

/** 与现有 MySQL schema 对应的全部 TypeORM 实体 */
export const ALL_ENTITIES = [
  UserEntity,
  DocumentEntity,
  DocumentContentEntity,
  DocumentSnapshotEntity,
  CrdtOplogEntity,
  RecordChangeHistoryEntity,
  DocumentSheetEntity,
  BaseTableEntity,
  BaseRecordEntity,
  BaseViewEntity,
  BaseDashboardEntity,
  BaseDashboardPrefsEntity,
  TenantEntity,
  TenantMemberEntity,
  OrganizationEntity,
  TenantPositionGroupEntity,
  TenantPositionEntity,
  TenantRoleEntity,
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
  DocCommentThreadEntity,
  DocCommentReplyEntity,
  DocCommentReplyLikeEntity,
  DocUserVisitEntity,
  QuotaDailyLogEntity,
  ...AI_ENTITIES,
  ...MCP_ENTITIES,
];
