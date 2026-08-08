import { SetMetadata } from '@nestjs/common';
import type { MembershipFeatureKey } from '../../types/membership';

export const MEMBERSHIP_FEATURES_KEY = 'membership_features';

/** 校验当前空间是否开通指定会员功能 */
export const RequireFeature = (...features: MembershipFeatureKey[]) =>
  SetMetadata(MEMBERSHIP_FEATURES_KEY, features);
