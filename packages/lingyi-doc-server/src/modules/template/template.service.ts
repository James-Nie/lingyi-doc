import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { DocTemplateRepository } from '../../repositories/doc-template.repository';
import type {
  DocTemplateCreateInput,
  DocTemplateDetail,
  DocTemplateListQuery,
  DocTemplateUpdateInput,
  TemplateStatus,
} from '../../types/template';

@Injectable()
export class TemplateService {
  constructor(private readonly templateRepository: DocTemplateRepository) {}

  listForAdmin(query: DocTemplateListQuery) {
    return this.templateRepository.list({ ...query, publishedOnly: false });
  }

  listForConsumer(query: DocTemplateListQuery) {
    return this.templateRepository.list({ ...query, publishedOnly: true });
  }

  async getForAdmin(id: string): Promise<DocTemplateDetail> {
    const detail = await this.templateRepository.getDetail(id);
    if (!detail) {
      throw new BusinessException(100004, '模板不存在', HttpStatus.NOT_FOUND);
    }
    return detail;
  }

  async getForConsumer(id: string): Promise<DocTemplateDetail> {
    const detail = await this.templateRepository.getDetail(id);
    if (!detail || detail.status !== 'published') {
      throw new BusinessException(100004, '模板不存在或未发布', HttpStatus.NOT_FOUND);
    }
    return detail;
  }

  async create(input: DocTemplateCreateInput, operatorId: string | null): Promise<DocTemplateDetail> {
    const id = await this.resolveCreateId(input);
    const payload = { ...input, id };
    this.validateCreateInput(payload);

    const existing = await this.templateRepository.findById(id, { includeDeleted: true });
    if (existing) {
      throw new BusinessException(100003, `模板 ID「${id}」已存在`);
    }

    return this.templateRepository.create(payload, operatorId);
  }

  private async resolveCreateId(input: DocTemplateCreateInput): Promise<string> {
    const trimmed = input.id?.trim();
    if (trimmed) {
      if (!this.templateRepository.validateId(trimmed)) {
        throw new BusinessException(100002, '模板 ID 仅允许小写字母、数字和连字符');
      }
      return trimmed;
    }
    for (let i = 0; i < 8; i++) {
      const candidate = `tpl-${randomBytes(4).toString('hex')}`;
      const existing = await this.templateRepository.findById(candidate, { includeDeleted: true });
      if (!existing) return candidate;
    }
    throw new BusinessException(100005, '生成模板 ID 失败', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async update(id: string, input: DocTemplateUpdateInput, operatorId: string | null): Promise<DocTemplateDetail> {
    if (input.docType && !this.templateRepository.validateDocType(input.docType)) {
      throw new BusinessException(100002, '无效的文档类型');
    }
    if (input.status && !this.templateRepository.validateStatus(input.status)) {
      throw new BusinessException(100002, '无效的模板状态');
    }

    const updated = await this.templateRepository.update(id, input, operatorId);
    if (!updated) {
      throw new BusinessException(100004, '模板不存在', HttpStatus.NOT_FOUND);
    }
    return updated;
  }

  async updateStatus(id: string, status: TemplateStatus, operatorId: string | null): Promise<DocTemplateDetail> {
    if (!this.templateRepository.validateStatus(status)) {
      throw new BusinessException(100002, '无效的模板状态');
    }
    return this.update(id, { status }, operatorId);
  }

  async remove(id: string, operatorId: string | null): Promise<void> {
    const ok = await this.templateRepository.softDelete(id, operatorId);
    if (!ok) {
      throw new BusinessException(100004, '模板不存在', HttpStatus.NOT_FOUND);
    }
  }

  async recordUse(id: string): Promise<void> {
    await this.templateRepository.incrementUseCount(id);
  }

  private validateCreateInput(input: DocTemplateCreateInput & { id: string }): void {
    if (!input.id?.trim()) {
      throw new BusinessException(100002, '缺少模板 ID');
    }
    if (!this.templateRepository.validateId(input.id.trim())) {
      throw new BusinessException(100002, '模板 ID 仅允许小写字母、数字和连字符');
    }
    if (!input.title?.trim()) {
      throw new BusinessException(100002, '缺少模板标题');
    }
    if (!input.documentTitle?.trim()) {
      throw new BusinessException(100002, '缺少创建文档标题');
    }
    if (!input.docType || !this.templateRepository.validateDocType(input.docType)) {
      throw new BusinessException(100002, '无效的文档类型');
    }
    if (input.status && !this.templateRepository.validateStatus(input.status)) {
      throw new BusinessException(100002, '无效的模板状态');
    }
    if (!input.isBlank && input.contentJson == null && input.status === 'published') {
      throw new BusinessException(100002, '非空白模板发布前需填写内容 JSON');
    }
  }
}
