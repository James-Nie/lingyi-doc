import { HttpStatus, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { DocumentRepository } from '../../repositories/document.repository';
import type { DocumentVersionDetail, DocumentVersionListItem } from '../../types/document-version';
import { documentAccessFromAuth } from '../../utils/documentAccessContext';
import { MembershipService } from '../membership/membership.service';

@Injectable()
export class DocumentVersionService {
  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly membershipService: MembershipService,
  ) {}

  async list(
    docId: string,
    auth: AuthUser,
    query: { limit?: number; beforeVersion?: number },
  ): Promise<{ items: DocumentVersionListItem[]; total: number; hasMore: boolean }> {
    await this.assertCanRead(docId, auth);
    return this.documentRepo.listVersions(docId, query);
  }

  async get(
    docId: string,
    version: number,
    auth: AuthUser,
  ): Promise<DocumentVersionDetail> {
    await this.assertCanRead(docId, auth);
    const detail = await this.documentRepo.getVersion(docId, version);
    if (!detail) {
      throw new BusinessException(200011, '历史版本不存在', HttpStatus.NOT_FOUND);
    }
    return detail;
  }

  async createNamed(
    docId: string,
    auth: AuthUser,
    label: string,
  ): Promise<DocumentVersionListItem> {
    const ctx = documentAccessFromAuth(auth);
    await this.assertCanWrite(docId, auth);

    const item = await this.documentRepo.createNamedVersion(docId, label, ctx);
    if (!item) {
      throw new BusinessException(200001, '文档不存在或无写权限', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  async restore(
    docId: string,
    version: number,
    auth: AuthUser,
  ): Promise<{ version: number }> {
    const ctx = documentAccessFromAuth(auth);
    await this.assertCanWrite(docId, auth);

    const result = await this.documentRepo.restoreVersion(docId, version, ctx);
    if (!result) {
      throw new BusinessException(200011, '历史版本不存在或无法还原', HttpStatus.NOT_FOUND);
    }
    return result;
  }

  private async assertCanRead(docId: string, auth: AuthUser): Promise<void> {
    const ctx = documentAccessFromAuth(auth);
    const doc = await this.documentRepo.findAccessibleById(docId, ctx);
    if (!doc) {
      throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
    }
  }

  private async assertCanWrite(docId: string, auth: AuthUser): Promise<void> {
    const ctx = documentAccessFromAuth(auth);
    const writeMeta = await this.documentRepo.getWriteMeta(docId, ctx);
    if (!writeMeta) {
      throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
    }
    await this.membershipService.assertWritableForDocument(auth, writeMeta);
    if (!(await this.documentRepo.hasWriteAccess(docId, ctx))) {
      throw new BusinessException(100403, '无文档写权限', HttpStatus.FORBIDDEN);
    }
  }
}
