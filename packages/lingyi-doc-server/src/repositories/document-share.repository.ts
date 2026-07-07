import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  DocShareAuditLogEntity,
  DocShareEntity,
  DocShareJoinRequestEntity,
  DocShareUserEntity,
  DocShareVisitLogEntity,
} from '../database/entities/document-share.entity';
import { UserEntity } from '../database/entities/user.entity';
import type {
  DocShareAuditAction,
  DocSharePermissionLevel,
  DocShareVisitStatus,
} from '../types/document-share';

@Injectable()
export class DocumentShareRepository {
  constructor(
    @InjectRepository(DocShareEntity)
    private readonly shareRepo: Repository<DocShareEntity>,
    @InjectRepository(DocShareUserEntity)
    private readonly shareUserRepo: Repository<DocShareUserEntity>,
    @InjectRepository(DocShareVisitLogEntity)
    private readonly visitLogRepo: Repository<DocShareVisitLogEntity>,
    @InjectRepository(DocShareJoinRequestEntity)
    private readonly joinRequestRepo: Repository<DocShareJoinRequestEntity>,
    @InjectRepository(DocShareAuditLogEntity)
    private readonly auditLogRepo: Repository<DocShareAuditLogEntity>,
  ) {}

  async findByDocId(docId: string): Promise<DocShareEntity | null> {
    return this.shareRepo.findOne({ where: { docId, shareType: 'link' } });
  }

  async findMemberShareByDocId(docId: string): Promise<DocShareEntity | null> {
    return this.shareRepo.findOne({ where: { docId, shareType: 'member' } });
  }

  async findByDocIdAndType(docId: string, shareType: 'link' | 'member'): Promise<DocShareEntity | null> {
    return this.shareRepo.findOne({ where: { docId, shareType } });
  }

  async findByToken(token: string): Promise<DocShareEntity | null> {
    return this.shareRepo.findOne({ where: { shareToken: token } });
  }

  async upsertShare(input: {
    docId: string;
    shareType?: 'link' | 'member';
    shareToken: string;
    permissionLevel: DocSharePermissionLevel;
    expireTime: Date | null;
    passwordHash: string | null | undefined;
    allowDownload: boolean;
    allowPrint: boolean;
    allowCopy: boolean;
    allowReshare: boolean;
    watermarkEnabled: boolean;
    operatorId: string;
  }): Promise<DocShareEntity> {
    const shareType = input.shareType ?? 'link';
    const existing = await this.findByDocIdAndType(input.docId, shareType);
    if (existing) {
      existing.shareType = shareType;
      existing.permissionLevel = input.permissionLevel;
      existing.expireTime = input.expireTime;
      if (input.passwordHash !== undefined) {
        existing.passwordHash = input.passwordHash;
      }
      existing.allowDownload = input.allowDownload ? 1 : 0;
      existing.allowPrint = input.allowPrint ? 1 : 0;
      existing.allowCopy = input.allowCopy ? 1 : 0;
      existing.allowReshare = input.allowReshare ? 1 : 0;
      existing.watermarkEnabled = input.watermarkEnabled ? 1 : 0;
      existing.status = 1;
      existing.updatedBy = input.operatorId;
      return this.shareRepo.save(existing);
    }

    const entity = this.shareRepo.create({
      id: uuidv4(),
      docId: input.docId,
      shareType,
      shareToken: input.shareToken,
      permissionLevel: input.permissionLevel,
      expireTime: input.expireTime,
      passwordHash: input.passwordHash ?? null,
      allowDownload: input.allowDownload ? 1 : 0,
      allowPrint: input.allowPrint ? 1 : 0,
      allowCopy: input.allowCopy ? 1 : 0,
      allowReshare: input.allowReshare ? 1 : 0,
      watermarkEnabled: input.watermarkEnabled ? 1 : 0,
      status: 1,
      createdBy: input.operatorId,
      updatedBy: input.operatorId,
    });
    return this.shareRepo.save(entity);
  }

  async closeShare(docId: string, operatorId: string, shareType: 'link' | 'member' = 'link'): Promise<boolean> {
    const existing = await this.findByDocIdAndType(docId, shareType);
    if (!existing) return false;
    existing.status = 0;
    existing.updatedBy = operatorId;
    await this.shareRepo.save(existing);
    return true;
  }

  async listCollaborators(docId: string): Promise<Array<{
    id: string;
    docId: string;
    subjectId: string;
    permissionLevel: string;
    expireTime: Date | null;
    createdAt: Date;
    displayName: string | null;
    email: string | null;
  }>> {
    const rows = await this.shareUserRepo
      .createQueryBuilder('su')
      .leftJoin(UserEntity, 'u', 'su.subjectId = u.id AND su.subjectType = :userType', { userType: 'user' })
      .where('su.docId = :docId', { docId })
      .andWhere('su.subjectType = :userType', { userType: 'user' })
      .select([
        'su.id AS id',
        'su.docId AS docId',
        'su.subjectId AS subjectId',
        'su.permissionLevel AS permissionLevel',
        'su.expireTime AS expireTime',
        'su.createdAt AS createdAt',
        'u.displayName AS displayName',
        'u.email AS email',
      ])
      .orderBy('su.createdAt', 'ASC')
      .getRawMany<{
        id: string;
        docId: string;
        subjectId: string;
        permissionLevel: string;
        expireTime: Date | null;
        createdAt: Date;
        displayName: string | null;
        email: string | null;
      }>();

    return rows;
  }

  async findCollaborator(docId: string, userId: string): Promise<DocShareUserEntity | null> {
    return this.shareUserRepo.findOne({
      where: { docId, subjectType: 'user', subjectId: userId },
    });
  }

  async getCollaboratorPermission(
    docId: string,
    userId: string,
  ): Promise<DocSharePermissionLevel | null> {
    const row = await this.findCollaborator(docId, userId);
    if (!row) return null;
    if (row.expireTime && row.expireTime.getTime() <= Date.now()) return null;
    if (row.permissionLevel === 'none') return null;
    return row.permissionLevel as DocSharePermissionLevel;
  }

  async addCollaborator(input: {
    docId: string;
    userId: string;
    permissionLevel: DocSharePermissionLevel;
    grantedBy: string;
    expireTime?: Date | null;
  }): Promise<DocShareUserEntity> {
    const existing = await this.findCollaborator(input.docId, input.userId);
    if (existing) {
      existing.permissionLevel = input.permissionLevel;
      existing.grantedBy = input.grantedBy;
      existing.expireTime = input.expireTime ?? null;
      return this.shareUserRepo.save(existing);
    }
    const entity = this.shareUserRepo.create({
      id: uuidv4(),
      docId: input.docId,
      subjectType: 'user',
      subjectId: input.userId,
      permissionLevel: input.permissionLevel,
      grantedBy: input.grantedBy,
      expireTime: input.expireTime ?? null,
    });
    return this.shareUserRepo.save(entity);
  }

  async removeCollaborator(docId: string, userId: string): Promise<boolean> {
    const result = await this.shareUserRepo.delete({
      docId,
      subjectType: 'user',
      subjectId: userId,
    });
    return (result.affected ?? 0) > 0;
  }

  async appendVisitLog(input: {
    docId: string;
    shareToken?: string | null;
    visitorId?: string | null;
    visitorIp?: string | null;
    deviceInfo?: string | null;
    visitStatus: DocShareVisitStatus;
    operateContent?: string | null;
  }): Promise<void> {
    await this.visitLogRepo.save(this.visitLogRepo.create({
      id: uuidv4(),
      docId: input.docId,
      shareToken: input.shareToken ?? null,
      visitorId: input.visitorId ?? null,
      visitorIp: input.visitorIp ?? null,
      deviceInfo: input.deviceInfo ?? null,
      visitStatus: input.visitStatus,
      operateContent: input.operateContent ?? null,
    }));
  }

  async listSharedWithUser(
    userId: string,
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
  ): Promise<Array<{
    id: string;
    title: string;
    docType: string;
    ownerId: string | null;
    ownerName: string | null;
    tenantId: string | null;
    scope: number;
    createdAt: Date;
    updatedAt: Date;
    lastVisitedAt: Date | null;
    tenantName: string | null;
    sharePermission: string;
    sharedByName: string | null;
  }>> {
    const orderClause = sortBy === 'created'
      ? 'd.created_at'
      : sortBy === 'updated'
        ? 'd.updated_at'
        : 'COALESCE(d.last_visited_at, d.updated_at)';

    return this.shareUserRepo.query(
      `SELECT
        d.id AS id,
        d.title AS title,
        d.doc_type AS docType,
        d.owner_id AS ownerId,
        u.display_name AS ownerName,
        d.tenant_id AS tenantId,
        d.scope AS scope,
        d.created_at AS createdAt,
        d.updated_at AS updatedAt,
        d.last_visited_at AS lastVisitedAt,
        t.name AS tenantName,
        su.permission_level AS sharePermission,
        g.display_name AS sharedByName
      FROM doc_share_user su
      INNER JOIN documents d ON d.id = su.doc_id AND d.is_deleted = 0
      LEFT JOIN users u ON d.owner_id = u.id
      LEFT JOIN users g ON su.granted_by = g.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      WHERE su.subject_type = 'user'
        AND su.subject_id = ?
        AND su.permission_level != 'none'
        AND (su.expire_time IS NULL OR su.expire_time > NOW())
      ORDER BY ${orderClause} DESC`,
      [userId],
    );
  }

  async findJoinRequest(docId: string, applicantId: string, status = 'pending'): Promise<DocShareJoinRequestEntity | null> {
    return this.joinRequestRepo.findOne({ where: { docId, applicantId, status } });
  }

  async createJoinRequest(input: {
    docId: string;
    applicantId: string;
    permissionLevel: DocSharePermissionLevel;
    message?: string | null;
  }): Promise<DocShareJoinRequestEntity> {
    return this.joinRequestRepo.save(this.joinRequestRepo.create({
      id: uuidv4(),
      docId: input.docId,
      applicantId: input.applicantId,
      permissionLevel: input.permissionLevel,
      status: 'pending',
      message: input.message ?? null,
      reviewedBy: null,
      reviewedAt: null,
    }));
  }

  async listJoinRequests(docId: string, status?: 'pending' | 'approved' | 'rejected'): Promise<Array<{
    id: string;
    docId: string;
    applicantId: string;
    permissionLevel: string;
    status: string;
    message: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    applicantName: string | null;
    applicantEmail: string | null;
  }>> {
    const qb = this.joinRequestRepo
      .createQueryBuilder('jr')
      .leftJoin(UserEntity, 'u', 'jr.applicantId = u.id')
      .where('jr.docId = :docId', { docId })
      .select([
        'jr.id AS id',
        'jr.docId AS docId',
        'jr.applicantId AS applicantId',
        'jr.permissionLevel AS permissionLevel',
        'jr.status AS status',
        'jr.message AS message',
        'jr.reviewedBy AS reviewedBy',
        'jr.reviewedAt AS reviewedAt',
        'jr.createdAt AS createdAt',
        'u.displayName AS applicantName',
        'u.email AS applicantEmail',
      ])
      .orderBy('jr.createdAt', 'DESC');

    if (status) {
      qb.andWhere('jr.status = :status', { status });
    }

    return qb.getRawMany();
  }

  async updateJoinRequestStatus(input: {
    requestId: string;
    status: 'approved' | 'rejected';
    reviewedBy: string;
  }): Promise<DocShareJoinRequestEntity | null> {
    const existing = await this.joinRequestRepo.findOne({ where: { id: input.requestId } });
    if (!existing) return null;
    existing.status = input.status;
    existing.reviewedBy = input.reviewedBy;
    existing.reviewedAt = new Date();
    return this.joinRequestRepo.save(existing);
  }

  async appendAuditLog(input: {
    docId: string;
    operatorId: string;
    operatorIp?: string | null;
    action: DocShareAuditAction | string;
    beforeJson?: Record<string, unknown> | null;
    afterJson?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.auditLogRepo.save(this.auditLogRepo.create({
      id: uuidv4(),
      docId: input.docId,
      operatorId: input.operatorId,
      operatorIp: input.operatorIp ?? null,
      action: input.action,
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
    }));
  }

  async getVisitStats(docId: string): Promise<{
    visitorCount: number;
    visitCount: number;
    todayNewVisits: number;
  }> {
    const rows = await this.visitLogRepo.query(
      `SELECT
        COUNT(DISTINCT visitor_id) AS visitorCount,
        COUNT(*) AS visitCount,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayNewVisits
      FROM doc_share_visit_log
      WHERE doc_id = ? AND visit_status = 'success'`,
      [docId],
    );
    const row = rows[0] ?? {};
    return {
      visitorCount: Number(row.visitorCount ?? 0),
      visitCount: Number(row.visitCount ?? 0),
      todayNewVisits: Number(row.todayNewVisits ?? 0),
    };
  }

  async listVisitRecords(docId: string, limit = 50): Promise<Array<{
    visitorId: string | null;
    displayName: string;
    email: string | null;
    lastVisitedAt: Date;
    visitCount: number;
  }>> {
    const rows = await this.visitLogRepo.query(
      `SELECT
        v.visitor_id AS visitorId,
        COALESCE(u.display_name, '访客') AS displayName,
        u.email AS email,
        MAX(v.created_at) AS lastVisitedAt,
        COUNT(*) AS visitCount
      FROM doc_share_visit_log v
      LEFT JOIN users u ON v.visitor_id = u.id
      WHERE v.doc_id = ? AND v.visit_status = 'success' AND v.visitor_id IS NOT NULL
      GROUP BY v.visitor_id, u.display_name, u.email
      ORDER BY lastVisitedAt DESC
      LIMIT ?`,
      [docId, limit],
    );
    return rows.map((row: Record<string, unknown>) => ({
      visitorId: (row.visitorId as string | null) ?? null,
      displayName: String(row.displayName ?? '访客'),
      email: (row.email as string | null) ?? null,
      lastVisitedAt: row.lastVisitedAt instanceof Date ? row.lastVisitedAt : new Date(String(row.lastVisitedAt)),
      visitCount: Number(row.visitCount ?? 0),
    }));
  }

  async listAuditLogs(docId: string, limit = 100): Promise<Array<{
    id: string;
    operatorId: string;
    operatorName: string;
    action: string;
    beforeJson: Record<string, unknown> | null;
    afterJson: Record<string, unknown> | null;
    createdAt: Date;
  }>> {
    const rows = await this.auditLogRepo.query(
      `SELECT
        a.id AS id,
        a.operator_id AS operatorId,
        COALESCE(u.display_name, '未知用户') AS operatorName,
        a.action AS action,
        a.before_json AS beforeJson,
        a.after_json AS afterJson,
        a.created_at AS createdAt
      FROM doc_share_audit_log a
      LEFT JOIN users u ON a.operator_id = u.id
      WHERE a.doc_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?`,
      [docId, limit],
    );
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      operatorId: String(row.operatorId),
      operatorName: String(row.operatorName ?? '未知用户'),
      action: String(row.action),
      beforeJson: (row.beforeJson as Record<string, unknown> | null) ?? null,
      afterJson: (row.afterJson as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
    }));
  }
}
