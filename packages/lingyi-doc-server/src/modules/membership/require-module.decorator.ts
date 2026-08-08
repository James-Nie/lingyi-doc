import { SetMetadata } from '@nestjs/common';
import type { MembershipModuleKey } from '../../types/membership';

export const MEMBERSHIP_MODULES_KEY = 'membership_modules';

/** 校验当前空间是否开通指定产品模块 */
export const RequireModule = (...modules: MembershipModuleKey[]) =>
  SetMetadata(MEMBERSHIP_MODULES_KEY, modules);
