import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AUDIT_ACTIONS } from '../../constants/audit';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { TenantRepository } from '../../repositories/tenant.repository';
import {
  TenantSecurityPolicyRepository,
  type TenantSecurityPolicy,
} from '../../repositories/tenant-security-policy.repository';
import { AuditWriterService } from '../../services/audit-writer.service';

/** 链接有效期上限的合法区间（天）。0 表示不限，其余 1~3650 */
const MAX_EXPIRE_UPPER_BOUND = 3650;
const WATERMARK_TEXT_MAX = 200;

/**
 * 外部协作与安全管控（P0-2）。
 *
 * 两层策略：
 * - 本控制器维护**租户级全局策略**（上限/下限）
 * - 单文档分享配置由 `DocumentShareService.upsertShare` 在写入时按本策略钳制
 *
 * 租户解析顺序：显式 query/body 指定（SaaS 平台管理员）→ 会话 currentTenantId → 工作区默认租户。
 * 私有化实例只有唯一租户，第三条兜底即可命中。
 */
@Controller('api/v1/admin/security/share-policy')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminSecurityController {
  private readonly logger = new Logger(AdminSecurityController.name);

  constructor(
    private readonly policyRepository: TenantSecurityPolicyRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly auditWriter: AuditWriterService,
  ) {}

  private async resolveTenantId(user: AuthUser, explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (user.currentTenantId) return user.currentTenantId;

    const tenants = await this.tenantRepository.listForUser(user.userId);
    if (tenants.length) return tenants[0].id;

    const all = await this.tenantRepository.listAll(1, 0);
    if (all.length) return all[0].id;

    throw new BusinessException(130002, '当前实例没有可用租户', HttpStatus.NOT_FOUND);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SECURITY_POLICY_READ)
  async get(@Query('tenantId') tenantId: string | undefined, @CurrentUser() user: AuthUser) {
    const resolved = await this.resolveTenantId(user, tenantId);
    return await this.policyRepository.get(resolved);
  }

  /** 供前端（管理端预览 / C 端分享面板）查询当前生效策略；不要求特定权限，仅需已登录管理员 */
  @Get('effective')
  async effective(@Query('tenantId') tenantId: string | undefined, @CurrentUser() user: AuthUser) {
    const resolved = await this.resolveTenantId(user, tenantId);
    const policy = await this.policyRepository.get(resolved);
    return {
      ...policy,
      // 前端据此隐藏被管理员禁止的入口，避免「设置了但无效」的困惑（C3 副作用缓解）
      uiHints: {
        hideExternalShareOption: !policy.allowExternalShare,
        disableLinkShare: !policy.linkShareEnabled,
        disableUnlimitedExpire: policy.maxExpireDays > 0,
        lockDownloadSwitch: policy.forceDisableDownload,
        lockCopySwitch: policy.forceDisableCopy,
        lockPrintSwitch: policy.forceDisablePrint,
        lockWatermarkSwitch: policy.forceWatermark,
      },
    };
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SECURITY_POLICY_WRITE)
  async update(
    @Body() body: Record<string, unknown>,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const resolved = await this.resolveTenantId(user, tenantId);
    const before = await this.policyRepository.get(resolved);
    const patch: Partial<TenantSecurityPolicy> = {};

    if (body.linkShareEnabled !== undefined) patch.linkShareEnabled = Boolean(body.linkShareEnabled);
    if (body.allowExternalShare !== undefined) patch.allowExternalShare = Boolean(body.allowExternalShare);
    if (body.forceDisableDownload !== undefined) patch.forceDisableDownload = Boolean(body.forceDisableDownload);
    if (body.forceDisableCopy !== undefined) patch.forceDisableCopy = Boolean(body.forceDisableCopy);
    if (body.forceDisablePrint !== undefined) patch.forceDisablePrint = Boolean(body.forceDisablePrint);
    if (body.forceWatermark !== undefined) patch.forceWatermark = Boolean(body.forceWatermark);
    if (body.requirePassword !== undefined) patch.requirePassword = Boolean(body.requirePassword);

    if (body.maxExpireDays !== undefined) {
      const v = Number(body.maxExpireDays);
      if (!Number.isInteger(v) || v < 0 || v > MAX_EXPIRE_UPPER_BOUND) {
        throw new BusinessException(100002, `链接有效期上限需为 0~${MAX_EXPIRE_UPPER_BOUND} 的整数（天），0 表示不限`);
      }
      patch.maxExpireDays = v;
    }

    if (body.watermarkText !== undefined) {
      const raw = body.watermarkText === null ? '' : String(body.watermarkText).trim();
      if (raw.length > WATERMARK_TEXT_MAX) {
        throw new BusinessException(100002, `水印文案不能超过 ${WATERMARK_TEXT_MAX} 个字符`);
      }
      patch.watermarkText = raw || null;
    }

    if (!Object.keys(patch).length) {
      throw new BusinessException(100002, '没有需要更新的字段');
    }

    // 强制水印开启却未配置文案时，给出默认文案，避免水印渲染为空
    const willForceWatermark = patch.forceWatermark ?? before.forceWatermark;
    const willWatermarkText = patch.watermarkText !== undefined ? patch.watermarkText : before.watermarkText;
    if (willForceWatermark && !willWatermarkText) {
      patch.watermarkText = '{user} {time}';
    }

    const after = await this.policyRepository.upsert(resolved, patch, user.userId);

    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.SECURITY_SHARE_POLICY_UPDATE,
      targetType: 'tenant_security_policy',
      targetId: resolved,
      detail: { before, after },
    });

    return after;
  }
}
