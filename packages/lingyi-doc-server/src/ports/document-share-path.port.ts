import type { AuthUser } from '../auth/decorators/current-user.decorator';

export interface DocumentSharePathPort {
  resolvePathForUser(auth: AuthUser, docId: string): Promise<unknown>;
}
