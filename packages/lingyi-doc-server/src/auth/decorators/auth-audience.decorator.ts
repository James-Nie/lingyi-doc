import { SetMetadata } from '@nestjs/common';

export type TokenAudience = 'consumer' | 'admin';

export const AUTH_AUDIENCE_KEY = 'authAudience';

export const AuthAudience = (audience: TokenAudience) =>
  SetMetadata(AUTH_AUDIENCE_KEY, audience);
