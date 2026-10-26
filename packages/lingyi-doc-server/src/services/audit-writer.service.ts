import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuthService } from './auth.service';
import { moduleOfAction } from '../constants/audit';

export interface AuditWriteInput {
  operatorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: unknown;
  /** success | failure，缺省 success */
  result?: 'success' | 'failure';
}

/**
 * 统一的审计写入入口（P0-7）。
 *
 * 为什么需要它：
 * - 此前每个 controller 各自实现 `writeAudit`，租户域（admin-tenant）干脆没有实现，
 *   导致「成员/部门/角色/职位的增删改」完全没有审计记录（评审缺陷 F7）。
 * - 集中到一处后，IP / UA / module 的推导口径唯一，且写入失败不会中断主流程
 *   （等保 8.1.4.3 d：不得因审计组件异常阻断业务；同时仓储层会记 error 日志）。
 */
@Injectable()
export class AuditWriterService {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    private readonly authService: AuthService,
  ) {}

  /** 从请求中提取操作人上下文并写入审计（fire-and-forget，不 await 阻塞响应） */
  write(req: Request | undefined, input: AuditWriteInput): void {
    void this.auditLogRepository.create({
      operatorId: input.operatorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detail: input.detail,
      result: input.result ?? 'success',
      ip: req ? this.authService.getClientIp(req) : null,
      userAgent: req ? this.authService.getUserAgent(req) : null,
    });
  }

  /** 记录失败事件（等保 8.1.4.3 b 要求记录事件是否成功） */
  writeFailure(req: Request | undefined, input: AuditWriteInput & { error: string }): void {
    void this.auditLogRepository.create({
      operatorId: input.operatorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detail: { ...(typeof input.detail === 'object' && input.detail ? input.detail : {}), error: input.error },
      result: 'failure',
      ip: req ? this.authService.getClientIp(req) : null,
      userAgent: req ? this.authService.getUserAgent(req) : null,
    });
  }

  /** 供批量场景构造「一次操作 N 个目标」的 detail */
  static batchDetail(targetIds: string[], extra?: Record<string, unknown>): unknown {
    return { count: targetIds.length, targetIds: targetIds.slice(0, 50), truncated: targetIds.length > 50, ...extra };
  }

  /** 模块名推导暴露给需要按模块筛选的调用方（与仓储写入口径一致） */
  static moduleOf(action: string): string {
    return moduleOfAction(action);
  }
}
