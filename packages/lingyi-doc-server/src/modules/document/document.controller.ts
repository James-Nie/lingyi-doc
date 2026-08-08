import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { DocumentRepository } from '../../repositories/document.repository';
import { StorageService } from '../../services/storage.service';
import { DocumentShareService } from '../document-share/document-share.service';
import { MembershipService } from '../membership/membership.service';
import { estimateJsonBytes, estimatePatchDelta, estimateSaveDelta } from '../membership/membership.utils';
import { shouldEnforceUniqueTitle } from '../../utils/documentTitle';
import { sendDocumentLoadHttpResult } from '../../utils/documentRecordJson';
import { WorkflowTriggerDispatcher, type RecordHistoryDispatchEntry } from '../ai/ai-workflow/workflow-trigger.dispatcher';

@Controller(['api/v1/c/docs', 'api/v1/docs'])
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly documentRepository: DocumentRepository,
    private readonly documentShareService: DocumentShareService,
    private readonly membershipService: MembershipService,
    private readonly workflowTriggerDispatcher: WorkflowTriggerDispatcher,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      const { title, docType = 'freeform', data } = body;
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) {
        throw new BusinessException(100002, '缺少文档标题');
      }

      const ctx = this.storageService.accessFromAuth(user);
      await this.membershipService.assertCanCreateDocument(user, ctx, String(docType));

      if (shouldEnforceUniqueTitle(trimmedTitle)
        && await this.storageService.existsDocumentTitle(trimmedTitle, undefined, ctx)) {
        throw new BusinessException(100003, `文档名称「${trimmedTitle}」已存在，请输入其他名称`);
      }

      const scope = this.documentRepository.resolveScope(ctx);
      return await this.storageService.createDocument({
        id: `doc_${uuidv4().slice(0, 8)}`,
        title: trimmedTitle,
        docType: String(docType),
        data: data ?? null,
        ownerId: user.userId,
        scope,
        tenantId: scope === 2 ? ctx.tenantId : null,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create failed', err);
      throw new BusinessException(100005, '创建文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('recycle-bin')
  async listRecycleBin(@CurrentUser() user: AuthUser) {
    try {
      const items = await this.storageService.listRecycleBin(this.storageService.accessFromAuth(user));
      return { items, total: items.length };
    } catch (err) {
      this.logger.error('recycle-bin list failed', err);
      throw new BusinessException(100005, '获取回收站失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('shared-with-me')
  async listSharedWithMe(
    @CurrentUser() user: AuthUser,
    @Query('sortBy') sortBy?: string,
  ) {
    try {
      const sort = (sortBy as 'lastVisited' | 'created' | 'updated') || 'lastVisited';
      return this.documentShareService.listSharedWithMe(user, sort);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('listSharedWithMe failed', err);
      throw new BusinessException(100005, '获取共享文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 归我所有：当前空间内我创建的全部文档（文档库 + 知识库） */
  @Get('owned')
  async listOwned(
    @CurrentUser() user: AuthUser,
    @Query('sortBy') sortBy?: string,
  ) {
    try {
      const sort = (sortBy as 'lastVisited' | 'created' | 'updated') || 'lastVisited';
      const list = await this.storageService.listOwnedDocuments(
        sort,
        this.storageService.accessFromAuth(user),
      );
      return { items: list, total: list.length };
    } catch (err) {
      this.logger.error('listOwned failed', err);
      throw new BusinessException(100005, '获取归我所有文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 最近访问：当前用户近 N 天内打开过的文档（默认 30 天，严格 per-user） */
  @Get('recent')
  async listRecent(
    @CurrentUser() user: AuthUser,
    @Query('sortBy') sortBy?: string,
    @Query('days') daysRaw?: string,
  ) {
    try {
      const sort = (sortBy as 'lastVisited' | 'created' | 'updated') || 'lastVisited';
      const days = daysRaw != null && daysRaw !== '' ? Number(daysRaw) : 30;
      const list = await this.storageService.listRecentDocuments(
        sort,
        this.storageService.accessFromAuth(user),
        days,
      );
      return { items: list, total: list.length };
    } catch (err) {
      this.logger.error('listRecent failed', err);
      throw new BusinessException(100005, '获取最近访问失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 我的文档库：未挂载知识库的文档 */
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('sortBy') sortBy?: string,
  ) {
    try {
      const sort = (sortBy as 'lastVisited' | 'created' | 'updated') || 'lastVisited';
      const list = await this.storageService.listLibraryDocuments(
        sort,
        this.storageService.accessFromAuth(user),
      );
      return { items: list, total: list.length };
    } catch (err) {
      this.logger.error('list failed', err);
      throw new BusinessException(100005, '获取文档列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':docId/path')
  async getDocPath(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      return await this.documentShareService.resolvePathForUser(user, docId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('getDocPath failed', err);
      throw new BusinessException(100005, '解析文档路径失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':docId/export')
  @SkipResponseWrap()
  async export(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Query('hd') hd: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const writeMeta = await this.documentRepository.getWriteMeta(docId, ctx);
      const meta = writeMeta ?? {
        scope: ctx.identityType === 'tenant' ? 2 : 1,
        ownerId: ctx.userId,
        tenantId: ctx.tenantId,
        storageSize: 0,
      };

      const isHd = hd === '1' || hd === 'true';
      if (isHd) {
        this.membershipService.assertFeature(
          await this.membershipService.resolveContextForDocument(meta, user),
          'export_hd',
          '高清导出需要会员权限',
        );
      }

      const exportCtx = await this.membershipService.assertCanExport(user, meta, { hd: isHd });

      const doc = await this.storageService.loadDocumentForUser(docId, ctx);
      if (!doc) {
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }
      void this.documentShareService.logDocumentOperationAudit(docId, user.userId, 'export', req?.ip ?? null);
      await this.membershipService.recordExport(exportCtx);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.title || 'document'}.json"`);
      res.json(doc);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('export failed', err);
      throw new BusinessException(100005, '导出文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('import')
  async importDoc(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      const { title, data } = body;
      if (!data) {
        throw new BusinessException(100002, '缺少文档数据');
      }

      const ctx = this.storageService.accessFromAuth(user);
      await this.membershipService.assertCanCreateDocument(user, ctx, 'freeform');

      const importBytes = estimateJsonBytes(data);
      await this.membershipService.assertStorageDeltaForDocument(user, {
        scope: ctx.identityType === 'tenant' ? 2 : 1,
        ownerId: ctx.userId,
        tenantId: ctx.tenantId,
        storageSize: 0,
      }, importBytes);

      const trimmedTitle = (typeof title === 'string' ? title.trim() : '') || '导入的文档';
      if (shouldEnforceUniqueTitle(trimmedTitle)
        && await this.storageService.existsDocumentTitle(trimmedTitle, undefined, ctx)) {
        throw new BusinessException(100003, `文档名称「${trimmedTitle}」已存在，请输入其他名称`);
      }

      const scope = this.documentRepository.resolveScope(ctx);
      return await this.storageService.createDocument({
        id: `doc_${uuidv4().slice(0, 8)}`,
        title: trimmedTitle,
        docType: 'freeform',
        data,
        ownerId: user.userId,
        scope,
        tenantId: scope === 2 ? ctx.tenantId : null,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('import failed', err);
      throw new BusinessException(100005, '导入文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':docId/info')
  async getDocumentInfo(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      return await this.documentShareService.getDocumentInfo(user, docId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('getDocumentInfo failed', err);
      throw new BusinessException(100005, '获取文档信息失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':docId')
  @SkipResponseWrap()
  async getOne(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const body = await this.storageService.loadDocumentWrappedJson(docId, ctx);
      if (!body) {
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }
      await this.storageService.touchLastVisitedUnchecked(docId, user.userId);
      void this.documentShareService.logDocumentEditorVisit(docId, user.userId);
      sendDocumentLoadHttpResult(res, { type: 'raw', body });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('get failed', err);
      throw new BusinessException(100005, '获取文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':docId/records/:recordId/history')
  async listRecordHistory(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('recordId') recordId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const result = await this.storageService.listRecordHistory(
        docId,
        recordId,
        {
          page: page != null && page !== '' ? Number(page) : 1,
          pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : 50,
        },
        ctx,
      );
      if (!result) {
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('listRecordHistory failed', err);
      throw new BusinessException(100005, '获取记录历史失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/patch')
  async patch(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const writeMeta = await this.documentRepository.getWriteMeta(docId, ctx);
      if (!writeMeta) {
        const readable = await this.storageService.loadDocumentForUser(docId, ctx);
        if (readable) {
          throw new BusinessException(100403, '没有编辑权限', HttpStatus.FORBIDDEN);
        }
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }

      await this.membershipService.assertWritableForDocument(user, writeMeta);
      await this.membershipService.assertStorageDeltaForDocument(
        user,
        writeMeta,
        estimatePatchDelta(body ?? {}),
      );

      const { baseVersion, title, ops, recordHistory } = body ?? {};
      if (!Number.isFinite(Number(baseVersion))) {
        throw new BusinessException(100002, '缺少 baseVersion');
      }

      const result = await this.storageService.patchDocument(docId, {
        baseVersion: Number(baseVersion),
        title: typeof title === 'string' ? title : undefined,
        ops: Array.isArray(ops) ? ops : [],
        recordHistory: Array.isArray(recordHistory) ? recordHistory : undefined,
      }, ctx);

      if ('conflict' in result && result.conflict) {
        throw new HttpException(
          {
            code: 200010,
            message: '版本冲突',
            data: { currentVersion: result.currentVersion },
          },
          HttpStatus.CONFLICT,
        );
      }

      await this.workflowTriggerDispatcher.dispatchRecordChanges(
        docId,
        recordHistory as RecordHistoryDispatchEntry[] | undefined,
        { userId: user.userId, tenantId: user.currentTenantId },
      );

      return result;
    } catch (err) {
      if (err instanceof BusinessException || err instanceof HttpException) throw err;
      this.logger.error('patch failed', err);
      throw new BusinessException(100005, '保存失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 更新文档基本信息（标题、描述等），不读写正文。
   * 侧边栏重命名等场景应走此接口，避免全量 PUT 覆盖内容。
   */
  @Patch(':docId/meta')
  async updateMeta(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const writeMeta = await this.documentRepository.getWriteMeta(docId, ctx);
      if (!writeMeta) {
        const readable = await this.storageService.loadDocumentForUser(docId, ctx);
        if (readable) {
          throw new BusinessException(100403, '没有编辑权限', HttpStatus.FORBIDDEN);
        }
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }

      await this.membershipService.assertWritableForDocument(user, writeMeta);

      const patch: { title?: string; description?: string | null } = {};
      if (body?.title !== undefined) {
        if (typeof body.title !== 'string') {
          throw new BusinessException(100002, '标题格式无效');
        }
        const trimmedTitle = body.title.trim();
        if (!trimmedTitle) {
          throw new BusinessException(100002, '文档标题不能为空');
        }
        patch.title = trimmedTitle;
      }
      if (body?.description !== undefined) {
        if (body.description !== null && typeof body.description !== 'string') {
          throw new BusinessException(100002, '描述格式无效');
        }
        patch.description = body.description === null ? null : body.description;
      }

      if (patch.title === undefined && patch.description === undefined) {
        throw new BusinessException(100002, '缺少可更新的基本信息字段');
      }

      if (
        patch.title
        && shouldEnforceUniqueTitle(patch.title)
        && await this.storageService.existsDocumentTitle(patch.title, docId, ctx)
      ) {
        throw new BusinessException(100003, `文档名称「${patch.title}」已存在，请输入其他名称`);
      }

      return await this.storageService.updateDocumentMeta(docId, patch, ctx);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('updateMeta failed', err);
      throw new BusinessException(100005, '更新文档信息失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':docId')
  async save(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const writeMeta = await this.documentRepository.getWriteMeta(docId, ctx);
      if (!writeMeta) {
        const readable = await this.storageService.loadDocumentForUser(docId, ctx);
        if (readable) {
          throw new BusinessException(100403, '没有编辑权限', HttpStatus.FORBIDDEN);
        }
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }

      await this.membershipService.assertWritableForDocument(user, writeMeta);
      await this.membershipService.assertStorageDeltaForDocument(
        user,
        writeMeta,
        estimateSaveDelta(body, writeMeta.storageSize),
      );

      return await this.storageService.saveDocument(docId, body, ctx);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('save failed', err);
      throw new BusinessException(100005, '保存文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':docId')
  async remove(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const existing = await this.storageService.loadDocumentForUser(docId, ctx);
      if (!existing) {
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }

      const ok = await this.storageService.deleteDocument(docId, ctx);
      return { success: ok };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete failed', err);
      throw new BusinessException(100005, '删除文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/restore')
  async restore(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      const ok = await this.storageService.restoreDocument(docId, this.storageService.accessFromAuth(user));
      if (!ok) {
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('restore failed', err);
      throw new BusinessException(100005, '恢复文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':docId/permanent')
  async permanentDelete(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      const ok = await this.storageService.permanentDeleteDocument(
        docId,
        this.storageService.accessFromAuth(user),
      );
      if (!ok) {
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('permanent delete failed', err);
      throw new BusinessException(100005, '永久删除失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
