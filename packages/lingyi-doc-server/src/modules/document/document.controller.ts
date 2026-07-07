import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
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
      await this.membershipService.assertCanCreateDocument(user, ctx);

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

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('sortBy') sortBy?: string,
  ) {
    try {
      const sort = (sortBy as 'lastVisited' | 'created' | 'updated') || 'lastVisited';
      const list = await this.storageService.listDocuments(sort, this.storageService.accessFromAuth(user));
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
      await this.membershipService.assertCanCreateDocument(user, ctx);

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
  async getOne(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      const ctx = this.storageService.accessFromAuth(user);
      const doc = await this.storageService.loadDocumentForUser(docId, ctx);
      if (!doc) {
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }
      await this.storageService.touchLastVisited(docId, ctx);
      void this.documentShareService.logDocumentEditorVisit(docId, user.userId);
      return doc;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('get failed', err);
      throw new BusinessException(100005, '获取文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
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
        throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
      }

      await this.membershipService.assertWritableForDocument(user, writeMeta);
      await this.membershipService.assertStorageDeltaForDocument(
        user,
        writeMeta,
        estimatePatchDelta(body ?? {}),
      );

      const { baseVersion, title, ops } = body ?? {};
      if (!Number.isFinite(Number(baseVersion))) {
        throw new BusinessException(100002, '缺少 baseVersion');
      }

      const result = await this.storageService.patchDocument(docId, {
        baseVersion: Number(baseVersion),
        title: typeof title === 'string' ? title : undefined,
        ops: Array.isArray(ops) ? ops : [],
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

      return result;
    } catch (err) {
      if (err instanceof BusinessException || err instanceof HttpException) throw err;
      this.logger.error('patch failed', err);
      throw new BusinessException(100005, '保存失败', HttpStatus.INTERNAL_SERVER_ERROR);
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
