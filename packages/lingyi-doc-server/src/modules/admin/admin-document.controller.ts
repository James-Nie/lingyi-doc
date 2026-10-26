import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AUDIT_ACTIONS } from '../../constants/audit';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AdminAccessRepository } from '../../repositories/admin-access.repository';
import {
  AdminDocumentRepository,
  type AdminDocumentFilter,
  type AdminDocumentRow,
} from '../../repositories/admin-document.repository';
import { AuditWriterService } from '../../services/audit-writer.service';

/** 批量操作单次上限，防止一次性锁住大表 */
const BATCH_LIMIT = 200;
/** 导出上限，与审计导出同规格 */
const EXPORT_LIMIT = 10000;

/** 服务端白名单，避免任意 docType 打到索引外 */
const DOC_TYPES = ['richtext', 'freeform', 'base', 'mindnote', 'slides', 'whiteboard', 'questionnaire'];

function parseDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BusinessException(100002, `${label}格式无效`);
  }
  return d;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new BusinessException(100002, 'docIds 必须为数组');
  }
  const ids = [...new Set(raw.map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (!ids.length) throw new BusinessException(100002, 'docIds 不能为空');
  if (ids.length > BATCH_LIMIT) {
    throw new BusinessException(100002, `单次操作最多 ${BATCH_LIMIT} 条，当前 ${ids.length} 条`);
  }
  return ids;
}

function formatTime(ms: number | null): string {
  return ms ? new Date(ms).toISOString() : '';
}

/**
 * 内容治理台（P0-1）。
 *
 * 管理范围（P0-3）在仓储层以 `documents.org_id ∈ scope` 落地，
 * 且**个人文档不对部门级管理员可见**。所有写操作先经 filterAllowedIds 过滤，
 * 越权目标会被静默剔除并在审计 detail 中记录被拒数量。
 */
@Controller('api/v1/admin/documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminDocumentController {
  private readonly logger = new Logger(AdminDocumentController.name);

  constructor(
    private readonly documentRepository: AdminDocumentRepository,
    private readonly accessRepository: AdminAccessRepository,
    private readonly auditWriter: AuditWriterService,
  ) {}

  private buildFilter(query: Record<string, unknown>): AdminDocumentFilter {
    const docType = typeof query.docType === 'string' ? query.docType : undefined;
    if (docType && !DOC_TYPES.includes(docType)) {
      throw new BusinessException(100002, '无效的文档类型');
    }
    const scopeRaw = query.scope;
    let scope: number | undefined;
    if (scopeRaw !== undefined && scopeRaw !== '' && scopeRaw !== null) {
      scope = Number(scopeRaw);
      if (scope !== 1 && scope !== 2) throw new BusinessException(100002, 'scope 仅支持 1（个人）或 2（企业）');
    }
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
    const sortByRaw = typeof query.sortBy === 'string' ? query.sortBy : 'created_at';
    const sortBy = (['created_at', 'updated_at', 'title', 'last_visited_at'].includes(sortByRaw)
      ? sortByRaw
      : 'created_at') as AdminDocumentFilter['sortBy'];

    return {
      keyword: typeof query.keyword === 'string' && query.keyword.trim() ? query.keyword.trim() : undefined,
      docType,
      scope,
      tenantId: typeof query.tenantId === 'string' && query.tenantId ? query.tenantId : undefined,
      orgId: typeof query.orgId === 'string' && query.orgId ? query.orgId : undefined,
      ownerId: typeof query.ownerId === 'string' && query.ownerId ? query.ownerId : undefined,
      deleted: typeof query.deleted === 'string' ? query.deleted : undefined,
      archived: typeof query.archived === 'string' ? query.archived : undefined,
      startDate: parseDate(typeof query.startDate === 'string' ? query.startDate : undefined, '开始时间'),
      endDate: parseDate(typeof query.endDate === 'string' ? query.endDate : undefined, '结束时间'),
      sortBy,
      sortOrder: query.sortOrder === 'ASC' ? 'ASC' : 'DESC',
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  async stats(@CurrentUser() user: AuthUser) {
    const scope = await this.accessRepository.getAdminScope(user.userId);
    return await this.documentRepository.stats(scope);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  async list(@Query() query: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    const scope = await this.accessRepository.getAdminScope(user.userId);
    const filter = this.buildFilter(query);
    const { items, total } = await this.documentRepository.list(filter, scope);
    return {
      items,
      total,
      page: Math.floor((filter.offset ?? 0) / (filter.limit || 20)) + 1,
      pageSize: filter.limit ?? 20,
      scopeType: scope.type,
    };
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.DOCUMENT_EXPORT)
  async export(
    @Res() res: Response,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.accessRepository.getAdminScope(user.userId);
    const filter = { ...this.buildFilter(query), limit: EXPORT_LIMIT, offset: 0 };
    const rows = await this.documentRepository.listForExport(filter, scope, EXPORT_LIMIT);

    const header = '文档ID,标题,类型,范围,所有者,租户,部门,版本,活跃分享数,创建时间,更新时间,是否归档,是否删除\n';
    const body = rows
      .map((r: AdminDocumentRow) =>
        [
          csvCell(r.id),
          csvCell(r.title),
          csvCell(r.docType),
          csvCell(r.scope === 2 ? '企业' : '个人'),
          csvCell(r.ownerName ?? r.ownerId),
          csvCell(r.tenantName ?? ''),
          csvCell(r.orgName ?? ''),
          csvCell(r.currentVersion),
          csvCell(r.activeShareCount),
          csvCell(formatTime(r.createdAt)),
          csvCell(formatTime(r.updatedAt)),
          csvCell(r.archivedAt ? '是' : '否'),
          csvCell(r.isDeleted ? '是' : '否'),
        ].join(','),
      )
      .join('\n');

    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.DOCUMENT_EXPORT,
      targetType: 'document',
      detail: { count: rows.length, filter: { ...filter, startDate: filter.startDate?.toISOString(), endDate: filter.endDate?.toISOString() } },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="documents-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send('\uFEFF' + header + body);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  async detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const scope = await this.accessRepository.getAdminScope(user.userId);
    const doc = await this.documentRepository.findById(id, scope);
    if (!doc) throw new BusinessException(100004, '文档不存在或不在你的管理范围内', HttpStatus.NOT_FOUND);
    const extras = await this.documentRepository.detailExtras(id);
    return { ...doc, ...extras };
  }

  @Post('transfer')
  @RequirePermissions(PERMISSIONS.DOCUMENT_WRITE)
  async transfer(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const ids = normalizeIds(body.docIds);
    const targetOwnerId = String(body.targetOwnerId ?? '').trim();
    if (!targetOwnerId) throw new BusinessException(100002, '缺少 targetOwnerId');

    const target = await this.documentRepository.findActiveUser(targetOwnerId);
    if (!target) throw new BusinessException(110004, '目标所有者不存在', HttpStatus.NOT_FOUND);
    if (target.status !== 'active') {
      throw new BusinessException(100002, `目标所有者「${target.displayName}」已被禁用，不能承接文档`);
    }

    const scope = await this.accessRepository.getAdminScope(user.userId);
    const allowed = await this.documentRepository.filterAllowedIds(ids, scope);
    const rejected = ids.filter((id) => !allowed.includes(id));
    if (!allowed.length) throw new BusinessException(110003, '目标文档均不在你的管理范围内', HttpStatus.FORBIDDEN);

    const affected = await this.documentRepository.transferOwnership(allowed, targetOwnerId);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.DOCUMENT_TRANSFER,
      targetType: 'document',
      targetId: allowed[0],
      detail: AuditWriterService.batchDetail(allowed, {
        targetOwnerId,
        targetOwnerName: target.displayName,
        affected,
        rejected,
      }),
    });
    return { success: true, affected, rejected };
  }

  @Post('archive')
  @RequirePermissions(PERMISSIONS.DOCUMENT_WRITE)
  async archive(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const ids = normalizeIds(body.docIds);
    const archived = body.archived !== false;
    const scope = await this.accessRepository.getAdminScope(user.userId);
    const allowed = await this.documentRepository.filterAllowedIds(ids, scope);
    if (!allowed.length) throw new BusinessException(110003, '目标文档均不在你的管理范围内', HttpStatus.FORBIDDEN);

    const affected = await this.documentRepository.setArchived(allowed, archived);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.DOCUMENT_ARCHIVE,
      targetType: 'document',
      targetId: allowed[0],
      detail: AuditWriterService.batchDetail(allowed, { archived, affected, rejected: ids.filter((i) => !allowed.includes(i)) }),
    });
    return { success: true, affected, archived };
  }

  @Post('delete')
  @RequirePermissions(PERMISSIONS.DOCUMENT_WRITE)
  async remove(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const ids = normalizeIds(body.docIds);
    const scope = await this.accessRepository.getAdminScope(user.userId);
    const allowed = await this.documentRepository.filterAllowedIds(ids, scope);
    if (!allowed.length) throw new BusinessException(110003, '目标文档均不在你的管理范围内', HttpStatus.FORBIDDEN);

    const affected = await this.documentRepository.softDelete(allowed);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.DOCUMENT_DELETE,
      targetType: 'document',
      targetId: allowed[0],
      detail: AuditWriterService.batchDetail(allowed, { affected, rejected: ids.filter((i) => !allowed.includes(i)) }),
    });
    return { success: true, affected };
  }

  @Post('restore')
  @RequirePermissions(PERMISSIONS.DOCUMENT_WRITE)
  async restore(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const ids = normalizeIds(body.docIds);
    const scope = await this.accessRepository.getAdminScope(user.userId);
    const allowed = await this.documentRepository.filterAllowedIds(ids, scope);
    if (!allowed.length) throw new BusinessException(110003, '目标文档均不在你的管理范围内', HttpStatus.FORBIDDEN);

    const affected = await this.documentRepository.restore(allowed);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.DOCUMENT_RESTORE,
      targetType: 'document',
      targetId: allowed[0],
      detail: AuditWriterService.batchDetail(allowed, { affected }),
    });
    return { success: true, affected };
  }

  @Post('purge')
  @RequirePermissions(PERMISSIONS.DOCUMENT_PURGE)
  async purge(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const ids = normalizeIds(body.docIds);
    const scope = await this.accessRepository.getAdminScope(user.userId);
    const allowed = await this.documentRepository.filterAllowedIds(ids, scope);
    if (!allowed.length) throw new BusinessException(110003, '目标文档均不在你的管理范围内', HttpStatus.FORBIDDEN);

    const { purged, skipped } = await this.documentRepository.purge(allowed);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.DOCUMENT_PURGE,
      targetType: 'document',
      targetId: allowed[0],
      detail: AuditWriterService.batchDetail(allowed, { purged, skipped }),
    });
    return { success: true, purged, skipped };
  }
}
