import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';

export const MEMBERSHIP_ERRORS = {
  QUOTA_LIMIT: 120001,
  VIP_PERMISSION_DENY: 120002,
  VIP_EXPIRED: 120003,
  TEAM_MEMBER_LIMIT: 120004,
  TEAM_CREATE_DENY: 120005,
} as const;

export function membershipError(
  code: keyof typeof MEMBERSHIP_ERRORS,
  message: string,
): BusinessException {
  return new BusinessException(MEMBERSHIP_ERRORS[code], message, HttpStatus.FORBIDDEN);
}
