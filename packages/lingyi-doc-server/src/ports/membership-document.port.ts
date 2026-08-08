import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { DocumentAccessContext } from '../types/session';

/** 创建文档前的配额 / 模块校验 */
export interface MembershipDocumentPort {
  assertCanCreateDocument(
    auth: AuthUser,
    ctx?: DocumentAccessContext,
    docType?: string,
  ): Promise<void>;
}
