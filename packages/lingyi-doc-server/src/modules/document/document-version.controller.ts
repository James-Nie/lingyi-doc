import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { DocumentVersionService } from './document-version.service';

@Controller(['api/v1/c/docs', 'api/v1/docs'])
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class DocumentVersionController {
  private readonly logger = new Logger(DocumentVersionController.name);

  constructor(private readonly versionService: DocumentVersionService) {}

  @Get(':docId/versions')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Query('limit') limit?: string,
    @Query('beforeVersion') beforeVersion?: string,
  ) {
    try {
      const parsedLimit = limit != null && limit !== '' ? Number(limit) : undefined;
      const parsedBefore =
        beforeVersion != null && beforeVersion !== '' ? Number(beforeVersion) : undefined;
      return await this.versionService.list(docId, user, {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
        beforeVersion: Number.isFinite(parsedBefore) ? parsedBefore : undefined,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('list versions failed', err);
      throw new BusinessException(100005, '获取历史记录失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':docId/versions/:version')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    try {
      return await this.versionService.get(docId, version, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('get version failed', err);
      throw new BusinessException(100005, '获取历史版本失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/versions')
  async createNamed(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: { label?: string },
  ) {
    try {
      const label = typeof body?.label === 'string' ? body.label.trim() : '';
      if (!label) {
        throw new BusinessException(100002, '请输入版本名称');
      }
      if (label.length > 200) {
        throw new BusinessException(100002, '版本名称不能超过 200 字');
      }
      return await this.versionService.createNamed(docId, user, label);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create named version failed', err);
      throw new BusinessException(100005, '另存为版本失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/versions/:version/restore')
  async restore(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    try {
      return await this.versionService.restore(docId, version, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('restore version failed', err);
      throw new BusinessException(100005, '还原历史版本失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
