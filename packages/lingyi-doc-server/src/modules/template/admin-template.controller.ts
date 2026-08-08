import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { AuthService } from '../../services/auth.service';
import { TemplateService } from './template.service';
import type {
  DocTemplateCreateInput,
  TemplateDocType,
  TemplateStatus,
} from '../../types/template';

@Controller('api/v1/admin/templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminTemplateController {
  private readonly logger = new Logger(AdminTemplateController.name);

  constructor(
    private readonly templateService: TemplateService,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly authService: AuthService,
  ) {}

  private writeAudit(
    req: Request,
    user: AuthUser,
    action: string,
    targetId: string,
    detail?: unknown,
  ) {
    void this.auditLogRepository.create({
      operatorId: user.userId,
      action,
      targetType: 'doc_template',
      targetId,
      detail,
      ip: this.authService.getClientIp(req),
      userAgent: this.authService.getUserAgent(req),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TEMPLATE_READ)
  async list(
    @Query('keyword') keyword?: string,
    @Query('docType') docType?: string,
    @Query('status') status?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    try {
      return await this.templateService.listForAdmin({
        keyword,
        docType: docType as TemplateDocType | undefined,
        status: status as TemplateStatus | undefined,
        page: Number(pageRaw) || 1,
        pageSize: Number(pageSizeRaw) || 20,
      });
    } catch (err) {
      this.logger.error('list templates failed', err);
      throw new BusinessException(100005, '获取模板列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TEMPLATE_READ)
  async get(@Param('id') id: string) {
    try {
      return await this.templateService.getForAdmin(id);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('get template failed', err);
      throw new BusinessException(100005, '获取模板详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TEMPLATE_WRITE)
  async create(
    @Body() body: DocTemplateCreateInput,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.templateService.create(body, user.userId);
      this.writeAudit(req, user, 'template.create', result.id, { title: result.title });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create template failed', err);
      throw new BusinessException(100005, '创建模板失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.TEMPLATE_WRITE)
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.templateService.update(id, body, user.userId);
      this.writeAudit(req, user, 'template.update', id, { title: result.title });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update template failed', err);
      throw new BusinessException(100005, '更新模板失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.TEMPLATE_WRITE)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const status = String(body?.status ?? '');
      const result = await this.templateService.updateStatus(id, status as TemplateStatus, user.userId);
      this.writeAudit(req, user, 'template.status', id, { status });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update template status failed', err);
      throw new BusinessException(100005, '更新模板状态失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TEMPLATE_WRITE)
  async remove(
    @Param('id') id: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      await this.templateService.remove(id, user.userId);
      this.writeAudit(req, user, 'template.delete', id);
      return { ok: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete template failed', err);
      throw new BusinessException(100005, '删除模板失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
