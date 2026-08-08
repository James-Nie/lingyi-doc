import type { AuthUser } from '../auth/decorators/current-user.decorator';

export interface DocumentAccessResult {
  canRead: boolean;
  canWrite: boolean;
  docVersion: number;
}

/** Collab / 权限面：只问能不能读/写，不暴露仓储 */
export interface DocumentAccessPort {
  checkAccess(docId: string, auth: AuthUser): Promise<DocumentAccessResult>;
}
