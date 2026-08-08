import type { MembershipModuleKey } from '../types/membership';
import { isMembershipModuleKey } from '../modules/membership/membership-modules';
import {
  loadLicenseResult,
  signLicensePayload,
  verifyLicenseSignature,
  type LicenseLoadResult,
  type LicensePayload,
  type ParsedLicense,
} from '@lingyi-doc/license';

/** @deprecated 使用 LicensePayload；保留别名兼容 */
export type DeployLicensePayload = LicensePayload;

export interface ParsedDeployLicense {
  tenantId?: string;
  expireAt: Date | null;
  seats?: number;
  aiQuota?: number;
  modules: MembershipModuleKey[];
  expired: boolean;
  signatureValid: boolean;
  issuedAt: Date | null;
  issuer: string | null;
}

export type DeployLicenseLoadResult =
  | { status: 'absent'; license: null; reason?: undefined }
  | { status: 'ok'; license: ParsedDeployLicense; reason?: undefined }
  | { status: 'expired'; license: ParsedDeployLicense; reason: 'expired' }
  | {
      status: 'invalid';
      license: null;
      reason: NonNullable<Extract<LicenseLoadResult, { status: 'invalid' }>['reason']>;
    };

export { signLicensePayload, verifyLicenseSignature };

function toDeployLicense(lic: ParsedLicense): ParsedDeployLicense {
  return {
    tenantId: lic.tenantId,
    expireAt: lic.expireAt,
    seats: lic.seats,
    aiQuota: lic.aiQuota,
    modules: lic.modules.filter(isMembershipModuleKey),
    expired: lic.expired,
    signatureValid: lic.signatureValid,
    issuedAt: lic.issuedAt,
    issuer: lic.issuer,
  };
}

/**
 * 加载部署 License（结构化结果；modules 按 MembershipModuleKey 过滤）。
 */
export function loadDeployLicenseResult(opts: {
  licenseFile?: string;
  licensePayload?: string;
  /** 验签公钥 PEM；不传用内置公钥（发行版）。测试可注入。 */
  publicKeyPem?: string;
  now?: Date;
}): DeployLicenseLoadResult {
  const result = loadLicenseResult({
    ...opts,
    filterModules: isMembershipModuleKey,
  });
  if (result.status === 'ok') {
    return { status: 'ok', license: toDeployLicense(result.license) };
  }
  if (result.status === 'expired') {
    return { status: 'expired', license: toDeployLicense(result.license), reason: 'expired' };
  }
  if (result.status === 'invalid') {
    return { status: 'invalid', license: null, reason: result.reason };
  }
  return { status: 'absent', license: null };
}

/** @deprecated 仅 ok 返回 license；优先 loadDeployLicenseResult */
export function loadDeployLicense(opts: {
  licenseFile?: string;
  licensePayload?: string;
  publicKeyPem?: string;
  now?: Date;
}): ParsedDeployLicense | null {
  const result = loadDeployLicenseResult(opts);
  return result.status === 'ok' ? result.license : null;
}

/** 面向用户的统一文案（过期 / 验签失败 / 文件缺失） */
export const LICENSE_UNAVAILABLE_MESSAGE =
  '软件授权无效或已过期，请续费或联系管理员更新授权';
