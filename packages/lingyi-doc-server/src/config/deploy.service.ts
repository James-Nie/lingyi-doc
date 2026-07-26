import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountMode, DeployType } from '../types/deploy';
import type { MembershipModuleKey } from '../types/membership';
import {
  buildModuleMap,
  parseEnabledModulesConfig,
  resolveModuleMap,
  type DeployEdition,
} from '../modules/membership/membership-modules';
import {
  LICENSE_UNAVAILABLE_MESSAGE,
  loadDeployLicenseResult,
  type DeployLicenseLoadResult,
  type ParsedDeployLicense,
} from './deploy-license';
import { LICENSE_ENFORCED } from '@lingyi-doc/license';
import { membershipError } from '../modules/membership/membership.errors';

@Injectable()
export class DeployService implements OnModuleInit {
  private readonly logger = new Logger(DeployService.name);
  private cachedLicenseResult: DeployLicenseLoadResult | undefined;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.isLicenseEnforced()) return;
    const result = this.getLicenseResult();
    if (result.status === 'ok') {
      this.logger.log(
        `License OK: modules=[${result.license.modules.join(',')}] expireAt=${result.license.expireAt?.toISOString() ?? 'never'}`,
      );
      return;
    }
    if (result.status === 'expired') {
      this.logger.warn(
        `License expired at ${result.license.expireAt?.toISOString() ?? '?'}; APIs that require modules will be denied`,
      );
      return;
    }
    if (result.status === 'invalid') {
      this.logger.warn(
        `License invalid (reason=${result.reason}); APIs that require modules will be denied`,
      );
      return;
    }
    // status === 'absent'：强制模式下未配置 License 源
    this.logger.warn(
      'License required but not configured (set LICENSE_FILE or LICENSE_PAYLOAD); APIs that require modules will be denied',
    );
  }

  get type(): DeployType {
    const v = Number(this.config.get<number>('deploy.type', 1));
    if (v === 2 || v === 3) return v;
    return 1;
  }

  get accountMode(): AccountMode {
    return Number(this.config.get<number>('deploy.accountMode', 1)) === 2 ? 2 : 1;
  }

  get defaultTenantId(): string | null {
    const id = this.config.get<string>('deploy.defaultTenantId', '');
    return id || null;
  }

  get defaultTenantName(): string {
    return this.config.get<string>('deploy.defaultTenantName', '默认企业');
  }

  get allowMultiTenantSwitch(): boolean {
    if (this.isPrivate()) return false;
    return this.config.get<boolean>('deploy.allowMultiTenantSwitch', true);
  }

  get enforceTenantFilter(): boolean {
    return this.config.get<boolean>('deploy.enforceTenantFilter', true);
  }

  /** saas | community；Community Edition 使用静态模块清单 */
  getEdition(): DeployEdition {
    const raw = (this.config.get<string>('deploy.edition', 'saas') || 'saas').toLowerCase();
    return raw === 'community' ? 'community' : 'saas';
  }

  /**
   * 部署级模块白名单；null = 不收窄。
   * 由 ENABLED_MODULES 配置，私有化裁剪时使用。
   */
  getEnabledModules(): MembershipModuleKey[] | null {
    const raw = this.config.get<string>('deploy.enabledModules', '');
    return parseEnabledModulesConfig(raw);
  }

  /**
   * 是否进入强制授权模式：
   * - 发行版编译期常量 LICENSE_ENFORCED=true → 始终强制（即使未配 License 源）。
   * - 否则（内部/开发）：显式配置了 License 源（FILE 或 PAYLOAD）才强制。
   */
  isLicenseEnforced(): boolean {
    if (LICENSE_ENFORCED) return true;
    const file = this.config.get<string>('deploy.licenseFile', '')?.trim();
    const payload = this.config.get<string>('deploy.licensePayload', '')?.trim();
    return !!(file || payload);
  }

  getLicenseResult(): DeployLicenseLoadResult {
    if (this.cachedLicenseResult !== undefined) return this.cachedLicenseResult;
    // 验签公钥使用 @lingyi-doc/license 内置常量，此处不传 publicKeyPem。
    this.cachedLicenseResult = loadDeployLicenseResult({
      licenseFile: this.config.get<string>('deploy.licenseFile', ''),
      licensePayload: this.config.get<string>('deploy.licensePayload', ''),
    });
    return this.cachedLicenseResult;
  }

  getLicense(): ParsedDeployLicense | null {
    const result = this.getLicenseResult();
    return result.status === 'ok' ? result.license : null;
  }

  /**
   * License 强制模式下：过期 / 验签失败 / 未配置统一拒绝（用户文案一致）。
   * 非强制模式不拦截。
   */
  assertLicenseAvailable(): void {
    if (!this.isLicenseEnforced()) return;
    const result = this.getLicenseResult();
    if (result.status === 'ok') return;
    if (result.status === 'expired') {
      throw membershipError('LICENSE_EXPIRED', LICENSE_UNAVAILABLE_MESSAGE);
    }
    // invalid（file_missing / signature_invalid / signature_required 等）
    // 或 absent（强制模式下未配置 License 源）→ 统一拒绝
    throw membershipError('LICENSE_INVALID', LICENSE_UNAVAILABLE_MESSAGE);
  }

  /**
   * 统一模块开通表。
   * License 强制模式：仅 status=ok 时使用证书 modules；过期/无效 → 全部关闭（不回退全开）。
   * 非强制：License > ENABLED_MODULES / Community > SaaS 全开。
   */
  getModuleMap(): Record<MembershipModuleKey, boolean> {
    const result = this.getLicenseResult();

    if (this.isLicenseEnforced()) {
      if (result.status === 'ok' && result.license.modules.length > 0) {
        return resolveModuleMap({ licenseModules: result.license.modules });
      }
      // expired / invalid / ok-but-empty → 全关，避免静默回退 ENABLED_MODULES=*
      return buildModuleMap([]);
    }

    return resolveModuleMap({
      edition: this.getEdition(),
      enabledOverride: this.getEnabledModules(),
      licenseModules: null,
    });
  }

  isSaas(): boolean {
    return this.type === 1;
  }

  isPrivate(): boolean {
    return this.type === 2 || this.type === 3;
  }

  canCreateTenant(): boolean {
    return this.isSaas();
  }

  defaultUserSource(): 1 | 2 {
    return this.isPrivate() ? 2 : 1;
  }
}
