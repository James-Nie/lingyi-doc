import { Injectable } from '@nestjs/common';
import type { ConsumerSessionContext } from '../types/session';
import type { AccessTokenPayload } from './auth.service';
import { DeployService } from '../config/deploy.service';
import { DEFAULT_CONSUMER_SESSION } from '../types/session';

@Injectable()
export class SessionService {
  constructor(private readonly deployService: DeployService) {}

  buildConsumerSession(partial?: Partial<ConsumerSessionContext>): ConsumerSessionContext {
    return {
      ...DEFAULT_CONSUMER_SESSION,
      userSource: this.deployService.defaultUserSource(),
      deployType: this.deployService.type,
      accountMode: this.deployService.accountMode,
      ...partial,
    };
  }

  sessionToTokenClaims(
    session: ConsumerSessionContext,
  ): Pick<
    AccessTokenPayload,
    | 'userSource'
    | 'currentIdentityType'
    | 'currentTenantId'
    | 'tenantRole'
    | 'deployType'
    | 'accountMode'
  > {
    return {
      userSource: session.userSource,
      currentIdentityType: session.currentIdentityType,
      currentTenantId: session.currentTenantId,
      tenantRole: session.tenantRole,
      deployType: session.deployType,
      accountMode: session.accountMode,
    };
  }

  tokenClaimsToSession(payload: AccessTokenPayload): ConsumerSessionContext {
    return this.buildConsumerSession({
      userSource: payload.userSource ?? this.deployService.defaultUserSource(),
      currentIdentityType: payload.currentIdentityType ?? 'personal',
      currentTenantId: payload.currentTenantId ?? null,
      tenantRole: payload.tenantRole ?? null,
      deployType: payload.deployType ?? this.deployService.type,
      accountMode: payload.accountMode ?? this.deployService.accountMode,
    });
  }

  sessionInfoFrom(session: ConsumerSessionContext) {
    return {
      ...session,
      allowMultiTenantSwitch: this.deployService.allowMultiTenantSwitch,
    };
  }
}
