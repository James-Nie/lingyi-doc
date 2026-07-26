import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserType, UserSource } from '../../types/database';
import type { AccountMode, DeployType, IdentityType } from '../../types/deploy';
import type { TenantRole } from '../../types/session';

export interface AuthUser {
  userId: string;
  email: string;
  userType: UserType;
  audience: 'consumer' | 'admin' | 'mcp';
  userSource?: UserSource;
  currentIdentityType?: IdentityType;
  currentTenantId?: string | null;
  tenantRole?: TenantRole | null;
  deployType?: DeployType;
  accountMode?: AccountMode;
  roles?: string[];
  permissions?: string[];
  mcpScopes?: string[];
  mcpTokenId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ auth?: AuthUser }>();
    return request.auth;
  },
);
