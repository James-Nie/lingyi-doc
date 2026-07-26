import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';

export const MEMBERSHIP_ERRORS = {
  QUOTA_LIMIT: 120001,
  VIP_PERMISSION_DENY: 120002,
  VIP_EXPIRED: 120003,
  TEAM_MEMBER_LIMIT: 120004,
  TEAM_CREATE_DENY: 120005,
  /** 产品模块未授权（私有化裁剪 / 加购未开通） */
  MODULE_DENY: 120006,
  /** 软件授权已过期（配置了 LICENSE_FILE/PAYLOAD） */
  LICENSE_EXPIRED: 120010,
  /** 软件授权无效（验签失败 / 文件缺失 / 无法解析） */
  LICENSE_INVALID: 120011,
} as const;

export function membershipError(
  code: keyof typeof MEMBERSHIP_ERRORS,
  message: string,
): BusinessException {
  return new BusinessException(MEMBERSHIP_ERRORS[code], message, HttpStatus.FORBIDDEN);
}
