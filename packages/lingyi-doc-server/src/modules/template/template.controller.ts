import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { TemplateService } from './template.service';
import type { TemplateDocType } from '../../types/template';

@Controller('api/v1/c/templates')
export class TemplateController {
  private readonly logger = new Logger(TemplateController.name);

  constructor(private readonly templateService: TemplateService) {}

  @Get()
  async list(
    @Query('keyword') keyword?: string,
    @Query('query') query?: string,
    @Query('docType') docType?: string,
    @Query('category') category?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    try {
      return await this.templateService.listForConsumer({
        keyword: keyword ?? query,
        docType: docType && docType !== 'all' ? docType as TemplateDocType : undefined,
        category,
        page: Number(pageRaw) || 1,
        pageSize: Math.min(200, Number(pageSizeRaw) || 100),
      });
    } catch (err) {
      this.logger.error('list consumer templates failed', err);
      throw new BusinessException(100005, '获取模板列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      return await this.templateService.getForConsumer(id);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('get consumer template failed', err);
      throw new BusinessException(100005, '获取模板详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':id/use')
  async recordUse(@Param('id') id: string) {
    try {
      await this.templateService.recordUse(id);
      return { ok: true };
    } catch (err) {
      this.logger.error('record template use failed', err);
      throw new BusinessException(100005, '记录模板使用失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
