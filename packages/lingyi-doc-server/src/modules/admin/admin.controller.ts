import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { isValidDemoStatus } from '../../constants/demoRequest';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AdminRoleRepository } from '../../repositories/admin-role.repository';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { DemoRequestRepository } from '../../repositories/demo-request.repository';
import { SystemConfigRepository } from '../../repositories/system-config.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { StorageService } from '../../services/storage.service';
import { HealthService } from '../health/health.service';
import { CollabService } from '../collab/collab.service';
import type { DemoRequestStatus, UserStatus } from '../../types/database';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly adminRoleRepository: AdminRoleRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly systemConfigRepository: SystemConfigRepository,
    private readonly demoRequestRepository: DemoRequestRepository,
    private readonly storageService: StorageService,
    private readonly dashboardService: DashboardService,
    private readonly healthService: HealthService,
    private readonly collabService: CollabService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private writeAudit(
    req: Request,
    user: AuthUser,
    action: string,
    targetType?: string,
    targetId?: string,
    detail?: unknown,
  ) {
    void this.auditLogRepository.create({
      operatorId: user.userId,
      action,
      targetType,
      targetId,
      detail,
      ip: this.authService.getClientIp(req),
      userAgent: this.authService.getUserAgent(req),
    });
  }

  @Get('dashboard/stats')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async dashboardStats() {
    try {
      const totalConsumers = await this.userRepository.countByType('consumer');
      const activeConsumers = await this.userRepository.countActiveConsumers(7);
      const totalAdmins = await this.userRepository.countByType('admin');
      const totalDocs = this.storageService.isReady() ? await this.storageService.countDocuments() : 0;
      const wsStats = this.collabService.getStats();
      const dbOk = await this.healthService.pingDatabase();

      return {
        users: { totalConsumers, activeConsumers, totalAdmins },
        documents: { total: totalDocs },
        collaboration: {
          enabled: this.collabService.isEnabled(),
          ...wsStats,
        },
        system: {
          uptime: process.uptime(),
          databaseConnected: dbOk,
          dbHost: this.config.get<string>('db.host'),
          dbName: this.config.get<string>('db.database'),
        },
      };
    } catch (err) {
      this.logger.error('dashboard stats failed', err);
      throw new BusinessException(100005, '获取统计数据失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('dashboard/trends')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async dashboardTrends(@Query('days') daysRaw?: string) {
    try {
      const days = Math.min(30, Math.max(1, Number(daysRaw) || 7));
      const points = await this.dashboardService.getTrends(days);
      return { days, points };
    } catch (err) {
      this.logger.error('dashboard trends failed', err);
      throw new BusinessException(100005, '获取趋势数据失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('users')
  @RequirePermissions(PERMISSIONS.USER_READ)
  async listUsers(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    try {
      const page = Math.max(1, Number(pageRaw) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
      const result = await this.userRepository.listByType('consumer', {
        keyword: typeof keyword === 'string' ? keyword : undefined,
        status: typeof status === 'string' ? status as UserStatus : undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return { ...result, page, pageSize };
    } catch (err) {
      this.logger.error('list users failed', err);
      throw new BusinessException(100005, '获取用户列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch('users/:userId/status')
  @RequirePermissions(PERMISSIONS.USER_SUSPEND)
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const { status } = body ?? {};
      if (status !== 'active' && status !== 'suspended') {
        throw new BusinessException(100002, '无效的状态值');
      }
      const target = await this.userRepository.findById(userId);
      if (!target || target.user_type !== 'consumer') {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      await this.userRepository.updateStatus(target.id, status);
      this.writeAudit(req, user, 'user.status_update', 'user', target.id, { status });
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update user status failed', err);
      throw new BusinessException(100005, '更新用户状态失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('admins')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_READ)
  async listAdmins(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    try {
      const page = Math.max(1, Number(pageRaw) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
      const { userIds, total } = await this.adminRoleRepository.listAdminUserIds(
        pageSize,
        (page - 1) * pageSize,
      );
      const users = await this.userRepository.findByIds(userIds);
      const roleMap = await this.adminRoleRepository.getUsersRoles(userIds);
      const userMap = new Map(users.map((u) => [u.id, u]));
      const items = userIds
        .map((id) => userMap.get(id))
        .filter(Boolean)
        .map((user) => ({
          ...this.userRepository.toPublicUser(user!),
          roles: roleMap.get(user!.id) ?? [],
        }));
      return { items, total, page, pageSize };
    } catch (err) {
      this.logger.error('list admins failed', err);
      throw new BusinessException(100005, '获取管理员列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('admins')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_WRITE)
  async createAdmin(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const { email, password, displayName, roleCode } = body ?? {};
      if (!email || !password || !displayName || !roleCode) {
        throw new BusinessException(100002, '缺少必填参数');
      }
      const pwdError = this.authService.validatePassword(String(password));
      if (pwdError) {
        throw new BusinessException(100002, pwdError);
      }
      const existing = await this.userRepository.findByEmail(String(email).trim().toLowerCase());
      if (existing) {
        throw new BusinessException(120002, '邮箱已注册');
      }
      const passwordHash = await bcrypt.hash(String(password), 12);
      const created = await this.userRepository.create({
        id: uuidv4(),
        email: String(email).trim().toLowerCase(),
        passwordHash,
        displayName: String(displayName).trim(),
        userType: 'admin',
      });
      await this.adminRoleRepository.assignRole(created.id, String(roleCode), user.userId);
      this.writeAudit(req, user, 'admin.create', 'admin_user', created.id, { roleCode });
      return this.userRepository.toPublicUser(created);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create admin failed', err);
      throw new BusinessException(100005, '创建管理员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('admins/assign')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_WRITE)
  async assignAdminRole(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const { userId, roleCode } = body ?? {};
      if (!userId || !roleCode) {
        throw new BusinessException(100002, '缺少必填参数');
      }
      const target = await this.userRepository.findById(String(userId));
      if (!target) {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      await this.adminRoleRepository.assignRole(target.id, String(roleCode), user.userId);
      this.writeAudit(req, user, 'admin.assign', 'admin_user', target.id, { roleCode });
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('assign admin role failed', err);
      throw new BusinessException(100005, '分配管理员角色失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch('admins/:userId/role')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_WRITE)
  async updateAdminRole(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const { roleCode } = body ?? {};
      if (!roleCode) {
        throw new BusinessException(100002, '缺少 roleCode');
      }
      const target = await this.userRepository.findById(userId);
      if (!target) {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      await this.adminRoleRepository.removeAllRoles(userId);
      await this.adminRoleRepository.assignRole(userId, String(roleCode), user.userId);
      this.writeAudit(req, user, 'admin.role_update', 'admin_user', userId, { roleCode });
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update admin role failed', err);
      throw new BusinessException(100005, '更新管理员角色失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('admins/:userId')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_WRITE)
  async removeAdmin(
    @Param('userId') userId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const target = await this.userRepository.findById(userId);
      if (!target) {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      await this.adminRoleRepository.removeAllRoles(userId);
      this.writeAudit(req, user, 'admin.remove', 'admin_user', userId);
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('remove admin failed', err);
      throw new BusinessException(100005, '移除管理员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_READ)
  async listRoles() {
    try {
      return await this.adminRoleRepository.listRoles();
    } catch (err) {
      this.logger.error('list roles failed', err);
      throw new BusinessException(100005, '获取角色列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('configs')
  @RequirePermissions(PERMISSIONS.CONFIG_READ)
  async listConfigs() {
    try {
      const items = await this.systemConfigRepository.list();
      return { items };
    } catch (err) {
      this.logger.error('list configs failed', err);
      throw new BusinessException(100005, '获取配置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('configs/:key')
  @RequirePermissions(PERMISSIONS.CONFIG_WRITE)
  async updateConfig(
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const { value, description } = body ?? {};
      if (value === undefined) {
        throw new BusinessException(100002, '缺少 value');
      }
      await this.systemConfigRepository.set(key, value, user.userId, typeof description === 'string' ? description : undefined);
      this.writeAudit(req, user, 'config.update', 'system_config', key, { value });
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update config failed', err);
      throw new BusinessException(100005, '更新配置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('audit-logs')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async listAuditLogs(
    @Query('operatorId') operatorId?: string,
    @Query('action') action?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    try {
      const page = Math.max(1, Number(pageRaw) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
      const result = await this.auditLogRepository.list({
        operatorId: typeof operatorId === 'string' ? operatorId : undefined,
        action: typeof action === 'string' ? action : undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return {
        items: result.items.map(row => ({
          id: row.id,
          operatorId: row.operator_id,
          operatorName: row.operator_name ?? null,
          action: row.action,
          targetType: row.target_type,
          targetId: row.target_id,
          detail: row.detail,
          ip: row.ip,
          createdAt: row.created_at instanceof Date ? row.created_at.getTime() : new Date(row.created_at).getTime(),
        })),
        total: result.total,
        page,
        pageSize,
      };
    } catch (err) {
      this.logger.error('audit logs failed', err);
      throw new BusinessException(100005, '获取审计日志失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('audit-logs/export')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async exportAuditLogs(
    @Res() res: Response,
    @Query('operatorId') operatorId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const limit = 10000;
      const result = await this.auditLogRepository.list({
        operatorId: typeof operatorId === 'string' ? operatorId : undefined,
        action: typeof action === 'string' ? action : undefined,
        limit,
        offset: 0,
      });
      // 如果传了日期范围，手动过滤
      let items = result.items;
      if (startDate) {
        const start = new Date(startDate).getTime();
        items = items.filter(i => new Date(i.created_at).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        items = items.filter(i => new Date(i.created_at).getTime() <= end);
      }

      // 生成 CSV
      const header = '操作,目标类型,目标ID,操作人,IP,时间\n';
      const rows = items.map(row => {
        const time = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString();
        const safe = (v: string | null | undefined) => {
          if (!v) return '';
          const s = String(v).replace(/"/g, '""');
          return `"${s}"`;
        };
        return [
          safe(row.action),
          safe(row.target_type),
          safe(row.target_id),
          safe(row.operator_name ?? row.operator_id),
          safe(row.ip),
          safe(time),
        ].join(',');
      });
      const csv = '\uFEFF' + header + rows.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch (err) {
      this.logger.error('export audit logs failed', err);
      throw new BusinessException(100005, '导出审计日志失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('demo-requests')
  @RequirePermissions(PERMISSIONS.DEMO_READ)
  async listDemoRequests(
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    try {
      const page = Math.max(1, Number(pageRaw) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));

      if (status && !isValidDemoStatus(status)) {
        throw new BusinessException(100002, '无效的状态筛选');
      }

      const result = await this.demoRequestRepository.list({
        status: status as DemoRequestStatus | undefined,
        keyword: typeof keyword === 'string' ? keyword : undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return {
        items: result.items.map(row => this.demoRequestRepository.toPublic(row)),
        total: result.total,
        page,
        pageSize,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('list demo requests failed', err);
      throw new BusinessException(100005, '获取预约演示列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('demo-requests/:id')
  @RequirePermissions(PERMISSIONS.DEMO_READ)
  async getDemoRequest(@Param('id') id: string) {
    try {
      const row = await this.demoRequestRepository.findById(id);
      if (!row) {
        throw new BusinessException(130001, '预约记录不存在', HttpStatus.NOT_FOUND);
      }
      return this.demoRequestRepository.toPublic(row);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('get demo request failed', err);
      throw new BusinessException(100005, '获取预约详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch('demo-requests/:id')
  @RequirePermissions(PERMISSIONS.DEMO_WRITE)
  async processDemoRequest(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const { status, handleComment, adminNote } = body ?? {};
      const comment = typeof handleComment === 'string'
        ? handleComment.trim()
        : typeof adminNote === 'string'
          ? adminNote.trim()
          : undefined;

      if (!status || !isValidDemoStatus(String(status))) {
        throw new BusinessException(100002, '无效的状态值');
      }
      if (status === 'pending') {
        throw new BusinessException(100002, '不能将预约重置为待处理状态');
      }
      if (!comment) {
        throw new BusinessException(100002, '请填写处理意见');
      }

      const existing = await this.demoRequestRepository.findById(id);
      if (!existing) {
        throw new BusinessException(130001, '预约记录不存在', HttpStatus.NOT_FOUND);
      }

      const updated = await this.demoRequestRepository.process(id, {
        status: status as DemoRequestStatus,
        handleComment: comment,
        processedBy: user.userId,
      });
      this.writeAudit(req, user, 'demo_request.process', 'demo_request', id, {
        status,
        handleComment: comment,
        processedBy: user.userId,
      });
      return this.demoRequestRepository.toPublic(updated!);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update demo request failed', err);
      throw new BusinessException(100005, '更新预约状态失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('security/password-policy')
  @RequirePermissions(PERMISSIONS.CONFIG_READ)
  async getPasswordPolicy() {
    try {
      const [minLength, requireMixed, registerEnabled, maxAttempts, lockDuration] = await Promise.all([
        this.systemConfigRepository.getValue('auth.password_min_length', 8),
        this.systemConfigRepository.getValue('auth.password_require_mixed', true),
        this.systemConfigRepository.getValue('auth.register_enabled', true),
        this.systemConfigRepository.getValue('auth.max_login_attempts', 5),
        this.systemConfigRepository.getValue('auth.lock_duration_minutes', 10),
      ]);
      return {
        passwordMinLength: minLength as number,
        passwordRequireMixed: requireMixed as boolean,
        registerEnabled: registerEnabled as boolean,
        maxLoginAttempts: maxAttempts as number,
        lockDurationMinutes: lockDuration as number,
      };
    } catch (err) {
      this.logger.error('get password policy failed', err);
      throw new BusinessException(100005, '获取安全策略失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('security/password-policy')
  @RequirePermissions(PERMISSIONS.CONFIG_WRITE)
  async updatePasswordPolicy(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const updates: Array<{ key: string; value: unknown }> = [];
      if (body.passwordMinLength !== undefined) {
        const v = Number(body.passwordMinLength);
        if (v < 6 || v > 32) throw new BusinessException(100002, '密码长度需在 6-32 之间');
        updates.push({ key: 'auth.password_min_length', value: v });
      }
      if (body.passwordRequireMixed !== undefined) {
        updates.push({ key: 'auth.password_require_mixed', value: Boolean(body.passwordRequireMixed) });
      }
      if (body.registerEnabled !== undefined) {
        updates.push({ key: 'auth.register_enabled', value: Boolean(body.registerEnabled) });
      }
      if (body.maxLoginAttempts !== undefined) {
        const v = Number(body.maxLoginAttempts);
        if (v < 1 || v > 50) throw new BusinessException(100002, '登录尝试次数需在 1-50 之间');
        updates.push({ key: 'auth.max_login_attempts', value: v });
      }
      if (body.lockDurationMinutes !== undefined) {
        const v = Number(body.lockDurationMinutes);
        if (v < 1 || v > 1440) throw new BusinessException(100002, '锁定时间需在 1-1440 分钟之间');
        updates.push({ key: 'auth.lock_duration_minutes', value: v });
      }
      for (const u of updates) {
        await this.systemConfigRepository.set(u.key, u.value, user.userId);
        this.writeAudit(req, user, 'security.policy_update', 'system_config', u.key, { value: u.value });
      }
      return { success: true, updated: updates.length };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update password policy failed', err);
      throw new BusinessException(100005, '更新安全策略失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('security/sessions')
  @RequirePermissions(PERMISSIONS.USER_READ)
  async listActiveSessions(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    try {
      const page = Math.max(1, Number(pageRaw) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
      const qb = this.dataSource.createQueryBuilder()
        .from('auth_sessions', 's')
        .leftJoin('users', 'u', 'u.id = s.user_id')
        .select([
          's.id',
          's.user_id',
          's.client_type',
          's.device_info',
          's.ip',
          's.created_at',
          's.expires_at',
          's.revoked_at',
          'u.display_name',
          'u.email',
        ])
        .where('s.revoked_at IS NULL')
        .orderBy('s.created_at', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize);
      const [items, total] = await Promise.all([
        qb.getRawMany(),
        qb.getCount(),
      ]);
      return {
        items: items.map((r: Record<string, unknown>) => ({
          id: r.s_id,
          userId: r.s_user_id,
          displayName: r.u_display_name ?? null,
          email: r.u_email ?? null,
          clientType: r.s_client_type,
          deviceInfo: r.s_device_info ?? null,
          ip: r.s_ip ?? null,
          createdAt: r.s_created_at instanceof Date ? r.s_created_at.getTime() : new Date(r.s_created_at as string).getTime(),
          expiresAt: r.s_expires_at instanceof Date ? r.s_expires_at.getTime() : new Date(r.s_expires_at as string).getTime(),
        })),
        total,
        page,
        pageSize,
      };
    } catch (err) {
      this.logger.error('list sessions failed', err);
      throw new BusinessException(100005, '获取活跃会话失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('security/sessions/:sessionId')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.dataSource.query(
        `UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
        [sessionId],
      );
      if (result.rowCount === 0) throw new BusinessException(100004, '会话不存在或已失效');
      this.writeAudit(req, user, 'session.revoke', 'auth_session', sessionId);
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('revoke session failed', err);
      throw new BusinessException(100005, '撤销会话失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
