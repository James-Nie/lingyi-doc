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
import {
  ADMIN_ROLE_CODES,
  ALL_PERMISSIONS,
  AUDIT_RETENTION_MAX_DAYS,
  AUDIT_RETENTION_MIN_DAYS,
  PERMISSIONS,
} from '../../constants/rbac';
import { AUDIT_ACTIONS, AUDIT_MODULE_LABELS, labelOfAction, moduleOfAction } from '../../constants/audit';
import { isValidDemoStatus } from '../../constants/demoRequest';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AdminAccessRepository } from '../../repositories/admin-access.repository';
import { AdminRoleRepository } from '../../repositories/admin-role.repository';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { DemoRequestRepository } from '../../repositories/demo-request.repository';
import { SystemConfigRepository } from '../../repositories/system-config.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuditWriterService } from '../../services/audit-writer.service';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { StorageService } from '../../services/storage.service';
import { HealthService } from '../health/health.service';
import { CollabService } from '../collab/collab.service';
import type { DemoRequestStatus, UserStatus } from '../../types/database';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** 审计日志保留天数的合法下限（等保三级 + 网络安全法第 21 条） */
const AUDIT_RETENTION_FLOOR = AUDIT_RETENTION_MIN_DAYS;

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly adminRoleRepository: AdminRoleRepository,
    private readonly adminAccessRepository: AdminAccessRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly systemConfigRepository: SystemConfigRepository,
    private readonly demoRequestRepository: DemoRequestRepository,
    private readonly storageService: StorageService,
    private readonly dashboardService: DashboardService,
    private readonly healthService: HealthService,
    private readonly collabService: CollabService,
    private readonly authService: AuthService,
    private readonly auditWriter: AuditWriterService,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** 统一走 AuditWriterService：IP/UA/module 口径唯一，且写入失败不阻断业务 */
  private writeAudit(
    req: Request,
    user: AuthUser,
    action: string,
    targetType?: string,
    targetId?: string,
    detail?: unknown,
  ) {
    this.auditWriter.write(req, { operatorId: user.userId, action, targetType, targetId, detail });
  }

  private static maskPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    if (phone.length < 7) return '****';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  private static maskEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const at = email.indexOf('@');
    if (at <= 0) return '****';
    const name = email.slice(0, at);
    const head = name.slice(0, Math.min(1, name.length));
    return `${head}***${email.slice(at)}`;
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
      // 等保三级 8.1.4.11 个人信息保护：列表默认脱敏，完整值走详情接口（需 user:write）
      return {
        items: result.items.map((u) => ({
          ...u,
          email: AdminController.maskEmail(u.email),
          phone: AdminController.maskPhone((u as { phone?: string | null }).phone),
          masked: true,
        })),
        total: result.total,
        page,
        pageSize,
      };
    } catch (err) {
      this.logger.error('list users failed', err);
      throw new BusinessException(100005, '获取用户列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('users/stats')
  @RequirePermissions(PERMISSIONS.USER_READ)
  async userStats() {
    try {
      const rows = await this.dataSource.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active,
           COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
           COUNT(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until > NOW())::int AS locked,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_last_7d,
           COUNT(*) FILTER (WHERE user_source = 2)::int AS local_accounts,
           COUNT(*) FILTER (WHERE imported_from IS NOT NULL)::int AS oauth_accounts
         FROM users WHERE user_type = 'consumer'`,
      );
      const r = rows[0] ?? {};
      return {
        total: Number(r.total ?? 0),
        active: Number(r.active ?? 0),
        suspended: Number(r.suspended ?? 0),
        locked: Number(r.locked ?? 0),
        newLast7d: Number(r.new_last_7d ?? 0),
        localAccounts: Number(r.local_accounts ?? 0),
        oauthAccounts: Number(r.oauth_accounts ?? 0),
      };
    } catch (err) {
      this.logger.error('user stats failed', err);
      throw new BusinessException(100005, '获取用户统计失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('users/:userId')
  @RequirePermissions(PERMISSIONS.USER_READ)
  async userDetail(@Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    try {
      const target = await this.userRepository.findById(userId);
      if (!target || target.user_type !== 'consumer') {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }

      const canSeePlain = user.permissions?.includes(PERMISSIONS.USER_WRITE) ?? false;

      const [memberships, sessions, docCount, bindings] = await Promise.all([
        this.dataSource.query(
          `SELECT tm.tenant_id, t.name AS tenant_name, tm.org_id, o.name AS org_name,
                  tm.position_id, p.name AS position_name, tm.tenant_role, tm.status, tm.joined_at
             FROM tenant_members tm
             LEFT JOIN tenants t ON t.id = tm.tenant_id
             LEFT JOIN organizations o ON o.id = tm.org_id
             LEFT JOIN tenant_positions p ON p.id = tm.position_id
            WHERE tm.user_id = $1
            ORDER BY tm.joined_at ASC`,
          [userId],
        ),
        this.dataSource.query(
          `SELECT COUNT(*)::int AS n FROM auth_sessions
            WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
          [userId],
        ),
        this.dataSource.query(
          `SELECT COUNT(*)::int AS n FROM documents WHERE owner_id = $1 AND is_deleted = false`,
          [userId],
        ),
        this.dataSource.query(
          `SELECT provider, provider_user_id, bound_at, last_used_at
             FROM user_oauth_bindings WHERE user_id = $1 ORDER BY bound_at ASC`,
          [userId],
        ),
      ]);

      const base = this.userRepository.toPublicUser(target);
      return {
        ...base,
        email: canSeePlain ? base.email : AdminController.maskEmail(base.email),
        phone: canSeePlain ? (base as { phone?: string | null }).phone ?? null : AdminController.maskPhone((base as { phone?: string | null }).phone),
        masked: !canSeePlain,
        lastLoginAt: target.last_login_at ? new Date(target.last_login_at).getTime() : null,
        loginFailCount: target.login_fail_count ?? 0,
        lockedUntil: target.locked_until ? new Date(target.locked_until).getTime() : null,
        needChangePassword: target.need_change_password === true,
        importedFrom: target.imported_from ?? null,
        lastOauthLoginAt: target.last_oauth_login_at ? new Date(target.last_oauth_login_at).getTime() : null,
        createdAt: target.created_at ? new Date(target.created_at).getTime() : null,
        memberships: memberships.map((m: Record<string, unknown>) => ({
          tenantId: m.tenant_id,
          tenantName: m.tenant_name,
          orgId: m.org_id,
          orgName: m.org_name,
          positionId: m.position_id,
          positionName: m.position_name,
          tenantRole: Number(m.tenant_role ?? 3),
          status: Number(m.status ?? 1),
          joinedAt: m.joined_at ? new Date(m.joined_at as string).getTime() : null,
        })),
        sessionCount: Number(sessions[0]?.n ?? 0),
        documentCount: Number(docCount[0]?.n ?? 0),
        oauthBindings: bindings.map((b: Record<string, unknown>) => ({
          provider: b.provider,
          providerUserId: b.provider_user_id,
          boundAt: b.bound_at ? new Date(b.bound_at as string).getTime() : null,
          lastUsedAt: b.last_used_at ? new Date(b.last_used_at as string).getTime() : null,
        })),
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('user detail failed', err);
      throw new BusinessException(100005, '获取用户详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('users/:userId/unlock')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  async unlockUser(
    @Param('userId') userId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const target = await this.userRepository.findById(userId);
      if (!target || target.user_type !== 'consumer') {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      await this.dataSource.query(
        `UPDATE users SET locked_until = NULL, login_fail_count = 0, updated_at = NOW() WHERE id = $1`,
        [userId],
      );
      this.writeAudit(req, user, AUDIT_ACTIONS.USER_UNLOCK, 'user', userId, {
        before: {
          lockedUntil: target.locked_until ? new Date(target.locked_until).toISOString() : null,
          loginFailCount: target.login_fail_count ?? 0,
        },
      });
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('unlock user failed', err);
      throw new BusinessException(100005, '解锁用户失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('users/:userId/force-logout')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  async forceLogoutUser(
    @Param('userId') userId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const target = await this.userRepository.findById(userId);
      if (!target || target.user_type !== 'consumer') {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      const rows: Array<{ id: string }> = await this.dataSource.query(
        `UPDATE auth_sessions SET revoked_at = NOW()
          WHERE user_id = $1 AND revoked_at IS NULL
          RETURNING id`,
        [userId],
      );
      const revoked = Array.isArray(rows) ? rows.length : 0;
      this.writeAudit(req, user, AUDIT_ACTIONS.USER_FORCE_LOGOUT, 'user', userId, { revoked });
      return { success: true, revoked };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('force logout user failed', err);
      throw new BusinessException(100005, '强制下线失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 管理员重置密码：生成一次性口令，置 need_change_password=true。
   * 口令只在本次响应返回一次，不落审计 detail（避免审计表成为凭据泄露面）。
   */
  @Post('users/:userId/reset-password')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  async resetUserPassword(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const target = await this.userRepository.findById(userId);
      if (!target || target.user_type !== 'consumer') {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      const provided = typeof body.password === 'string' && body.password ? body.password : null;
      const tempPassword = provided ?? `Ld${uuidv4().replace(/-/g, '').slice(0, 10)}!`;

      const pwdError = this.authService.validatePassword(tempPassword);
      if (pwdError) throw new BusinessException(100002, pwdError);

      const passwordHash = await bcrypt.hash(tempPassword, 12);
      await this.dataSource.query(
        `UPDATE users
            SET password_hash = $1, need_change_password = true,
                login_fail_count = 0, locked_until = NULL, updated_at = NOW()
          WHERE id = $2`,
        [passwordHash, userId],
      );
      // 改密后吊销既有会话，避免旧会话继续可用（等保 8.1.4.1 b 结束会话）
      const revokedRows: Array<{ id: string }> = await this.dataSource.query(
        `UPDATE auth_sessions SET revoked_at = NOW()
          WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
        [userId],
      );

      this.writeAudit(req, user, AUDIT_ACTIONS.USER_PASSWORD_RESET, 'user', userId, {
        forcedChange: true,
        revokedSessions: Array.isArray(revokedRows) ? revokedRows.length : 0,
      });

      return {
        success: true,
        tempPassword,
        needChangePassword: true,
        revokedSessions: Array.isArray(revokedRows) ? revokedRows.length : 0,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('reset user password failed', err);
      throw new BusinessException(100005, '重置密码失败', HttpStatus.INTERNAL_SERVER_ERROR);
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
      const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : undefined;
      if (status !== 'active' && status !== 'suspended') {
        throw new BusinessException(100002, '无效的状态值');
      }
      const target = await this.userRepository.findById(userId);
      if (!target || target.user_type !== 'consumer') {
        throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
      }
      await this.userRepository.updateStatus(target.id, status);
      // 禁用用户时同步吊销其会话，避免「禁用后仍能继续编辑」
      let revokedSessions = 0;
      if (status === 'suspended') {
        const rows: Array<{ id: string }> = await this.dataSource.query(
          `UPDATE auth_sessions SET revoked_at = NOW()
            WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
          [target.id],
        );
        revokedSessions = Array.isArray(rows) ? rows.length : 0;
      }
      this.writeAudit(req, user, AUDIT_ACTIONS.USER_STATUS_UPDATE, 'user', target.id, {
        status,
        reason,
        revokedSessions,
      });
      return { success: true, revokedSessions };
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
      this.writeAudit(req, user, AUDIT_ACTIONS.ADMIN_CREATE, 'admin_user', created.id, { roleCode });
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
      this.writeAudit(req, user, AUDIT_ACTIONS.ADMIN_ASSIGN, 'admin_user', target.id, { roleCode });
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
      // 最后超管保护：变更后必须仍有人持有 super_admin
      const currentRoles = await this.adminRoleRepository.getUserRoles(userId);
      const isCurrentlySuperAdmin = currentRoles.some((r) => r.code === ADMIN_ROLE_CODES.SUPER_ADMIN);
      if (isCurrentlySuperAdmin && String(roleCode) !== ADMIN_ROLE_CODES.SUPER_ADMIN) {
        const stillHas = await this.adminAccessRepository.hasOtherSuperAdmin(userId);
        if (!stillHas) {
          throw new BusinessException(110006, '该管理员是当前唯一的超级管理员，变更角色后将无人可管理系统，操作已拒绝');
        }
      }
      await this.adminRoleRepository.removeAllRoles(userId);
      await this.adminRoleRepository.assignRole(userId, String(roleCode), user.userId);
      this.writeAudit(req, user, AUDIT_ACTIONS.ADMIN_ROLE_UPDATE, 'admin_user', userId, {
        before: currentRoles.map((r) => r.code),
        roleCode,
      });
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
      // 最后超管保护
      if (await this.adminAccessRepository.listSuperAdminUserIds().then((ids) => ids.includes(userId))) {
        const stillHas = await this.adminAccessRepository.hasOtherSuperAdmin(userId);
        if (!stillHas) {
          throw new BusinessException(110006, '该管理员是当前唯一的超级管理员，移除后将无人可管理系统，操作已拒绝');
        }
      }
      const beforeRoles = await this.adminRoleRepository.getUserRoles(userId);
      await this.adminRoleRepository.removeAllRoles(userId);
      this.writeAudit(req, user, AUDIT_ACTIONS.ADMIN_REMOVE, 'admin_user', userId, {
        roles: beforeRoles.map((r) => r.code),
      });
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('remove admin failed', err);
      throw new BusinessException(100005, '移除管理员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 角色列表已迁至 `AdminRoleController`（GET /api/v1/admin/roles），
   * 此处不再保留同名路由，避免同一 method+path 出现两个 handler。
   */
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
      this.writeAudit(req, user, AUDIT_ACTIONS.CONFIG_UPDATE, 'system_config', key, { value });
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update config failed', err);
      throw new BusinessException(100005, '更新配置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ==============================================================
  // 审计日志（P0-7）
  // 路由顺序要求：静态子路径（facets/retention/cleanup/export）必须声明在 :id 之前
  // ==============================================================

  private buildAuditFilter(query: Record<string, unknown>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(10000, Math.max(1, Number(query.pageSize) || 20));
    const parse = (v: unknown, label: string): Date | undefined => {
      if (typeof v !== 'string' || !v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BusinessException(100002, `${label}格式无效`);
      return d;
    };
    return {
      operatorId: typeof query.operatorId === 'string' && query.operatorId ? query.operatorId : undefined,
      action: typeof query.action === 'string' && query.action ? query.action : undefined,
      actionKeyword: typeof query.actionKeyword === 'string' && query.actionKeyword ? query.actionKeyword : undefined,
      module: typeof query.module === 'string' && query.module ? query.module : undefined,
      result: query.result === 'success' || query.result === 'failure' ? query.result : undefined,
      targetType: typeof query.targetType === 'string' && query.targetType ? query.targetType : undefined,
      keyword: typeof query.keyword === 'string' && query.keyword.trim() ? query.keyword.trim() : undefined,
      startDate: parse(query.startDate, '开始时间'),
      endDate: parse(query.endDate, '结束时间'),
      sortOrder: query.sortOrder === 'ASC' ? ('ASC' as const) : ('DESC' as const),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      page,
      pageSize,
    };
  }

  private static toAuditItem(row: {
    id: number;
    operator_id: string;
    operator_name?: string | null;
    action: string;
    module: string | null;
    result: string;
    target_type: string | null;
    target_id: string | null;
    detail: unknown;
    ip: string | null;
    created_at: Date;
  }) {
    return {
      id: row.id,
      operatorId: row.operator_id,
      operatorName: row.operator_name ?? null,
      action: row.action,
      actionLabel: labelOfAction(row.action),
      module: row.module ?? moduleOfAction(row.action),
      result: row.result,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: row.detail,
      ip: row.ip,
      createdAt: row.created_at instanceof Date ? row.created_at.getTime() : new Date(row.created_at).getTime(),
    };
  }

  @Get('audit-logs')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async listAuditLogs(@Query() query: Record<string, unknown>) {
    try {
      const filter = this.buildAuditFilter(query);
      const result = await this.auditLogRepository.list(filter);
      return {
        items: result.items.map((row) => AdminController.toAuditItem(row)),
        total: result.total,
        page: filter.page,
        pageSize: filter.pageSize,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('audit logs failed', err);
      throw new BusinessException(100005, '获取审计日志失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 可选筛选项（模块 / 动作 / 操作人），供前端下拉，避免手输 ID */
  @Get('audit-logs/facets')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditFacets(@Query('days') daysRaw?: string) {
    try {
      const days = Math.min(365, Math.max(1, Number(daysRaw) || 90));
      const facets = await this.auditLogRepository.facets(days);
      return {
        days,
        modules: facets.modules.map((m) => ({ value: m, label: AUDIT_MODULE_LABELS[m] ?? m })),
        actions: facets.actions.map((a) => ({
          value: a.action,
          label: labelOfAction(a.action),
          module: moduleOfAction(a.action),
          count: a.count,
        })),
        operators: facets.operators,
        results: [
          { value: 'success', label: '成功' },
          { value: 'failure', label: '失败' },
        ],
      };
    } catch (err) {
      this.logger.error('audit facets failed', err);
      throw new BusinessException(100005, '获取审计筛选项失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 保留策略：天数 + 留存跨度 + 总量，供合规自证 */
  @Get('audit-logs/retention')
  @RequirePermissions(PERMISSIONS.CONFIG_READ)
  async auditRetention() {
    try {
      const [days, lastCleanupAt, total, earliest] = await Promise.all([
        this.systemConfigRepository.getValue('audit.retention_days', AUDIT_RETENTION_MIN_DAYS),
        this.systemConfigRepository.getValue<unknown>('audit.last_cleanup_at', null),
        this.auditLogRepository.countAll(),
        this.auditLogRepository.earliestCreatedAt(),
      ]);
      const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
      const expired = await this.auditLogRepository.countBefore(cutoff);
      return {
        retentionDays: Number(days),
        minDays: AUDIT_RETENTION_MIN_DAYS,
        maxDays: AUDIT_RETENTION_MAX_DAYS,
        lastCleanupAt: typeof lastCleanupAt === 'string' ? lastCleanupAt : null,
        total,
        earliestCreatedAt: earliest ? earliest.getTime() : null,
        expiredCount: expired,
        /** 数据来源：等保三级 + 网络安全法第 21 条要求网络日志留存不少于 6 个月 */
        complianceNote: `保留天数不得低于 ${AUDIT_RETENTION_MIN_DAYS} 天（等保三级 / 网络安全法第 21 条）`,
      };
    } catch (err) {
      this.logger.error('audit retention failed', err);
      throw new BusinessException(100005, '获取审计保留策略失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('audit-logs/retention')
  @RequirePermissions(PERMISSIONS.AUDIT_MANAGE)
  async updateAuditRetention(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const days = Number(body?.retentionDays);
      if (!Number.isInteger(days) || days < AUDIT_RETENTION_FLOOR || days > AUDIT_RETENTION_MAX_DAYS) {
        throw new BusinessException(
          100002,
          `保留天数需为 ${AUDIT_RETENTION_FLOOR}~${AUDIT_RETENTION_MAX_DAYS} 的整数（等保三级要求不低于 ${AUDIT_RETENTION_FLOOR} 天）`,
        );
      }
      const before = await this.systemConfigRepository.getValue('audit.retention_days', AUDIT_RETENTION_MIN_DAYS);
      await this.systemConfigRepository.set('audit.retention_days', days, user.userId);
      this.writeAudit(req, user, AUDIT_ACTIONS.CONFIG_UPDATE, 'system_config', 'audit.retention_days', {
        before, after: days,
      });
      return { success: true, retentionDays: days };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update audit retention failed', err);
      throw new BusinessException(100005, '更新审计保留策略失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 按保留策略清理过期审计日志。
   *
   * 等保三级 8.1.4.3 c) 要求审计记录避免未预期的删除 —— 因此：
   * - 唯一删除入口，天数下限锁死 180 天
   * - 清理动作本身写 `audit.cleanup` 审计（含删除条数与清理前总量）
   */
  @Post('audit-logs/cleanup')
  @RequirePermissions(PERMISSIONS.AUDIT_MANAGE)
  async cleanupAuditLogs(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const days = Number(
        body?.retentionDays ?? (await this.systemConfigRepository.getValue('audit.retention_days', AUDIT_RETENTION_MIN_DAYS)),
      );
      if (!Number.isInteger(days) || days < AUDIT_RETENTION_FLOOR) {
        throw new BusinessException(100002, `清理保留期不得低于 ${AUDIT_RETENTION_FLOOR} 天`);
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const beforeTotal = await this.auditLogRepository.countAll();
      const candidate = await this.auditLogRepository.countBefore(cutoff);

      if (body?.dryRun === true) {
        return { success: true, dryRun: true, wouldDelete: candidate, cutoff: cutoff.toISOString() };
      }

      const deleted = await this.auditLogRepository.deleteBefore(cutoff);
      const cleanedAt = new Date().toISOString();
      await this.systemConfigRepository.set('audit.last_cleanup_at', cleanedAt, user.userId);

      this.writeAudit(req, user, AUDIT_ACTIONS.AUDIT_CLEANUP, 'audit_log', undefined, {
        retentionDays: days,
        cutoff: cutoff.toISOString(),
        deleted,
        beforeTotal,
      });
      return { success: true, deleted, beforeTotal, retentionDays: days, cutoff: cutoff.toISOString() };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('cleanup audit logs failed', err);
      throw new BusinessException(100005, '清理审计日志失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('audit-logs/export')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async exportAuditLogs(@Res() res: Response, @Query() query: Record<string, unknown>, @Req() req: Request, @CurrentUser() user: AuthUser) {
    try {
      const limit = 10000;
      const filter = { ...this.buildAuditFilter(query), limit, offset: 0 };
      const result = await this.auditLogRepository.list(filter);

      const header = '时间,事件类型,事件名称,模块,结果,目标类型,目标ID,操作人,IP\n';
      const csvCell = (v: unknown) => {
        if (v === null || v === undefined) return '';
        return `"${String(v).replace(/"/g, '""')}"`;
      };
      const rows = result.items.map((row) => {
        const time = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString();
        return [
          csvCell(time),
          csvCell(row.action),
          csvCell(labelOfAction(row.action)),
          csvCell(row.module ?? moduleOfAction(row.action)),
          csvCell(row.result === 'failure' ? '失败' : '成功'),
          csvCell(row.target_type),
          csvCell(row.target_id),
          csvCell(row.operator_name ?? row.operator_id),
          csvCell(row.ip),
        ].join(',');
      });

      this.writeAudit(req, user, AUDIT_ACTIONS.DOCUMENT_EXPORT, 'audit_log', undefined, {
        count: result.items.length,
        filter: { ...filter, startDate: filter.startDate?.toISOString(), endDate: filter.endDate?.toISOString() },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send('\uFEFF' + header + rows.join('\n'));
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('export audit logs failed', err);
      throw new BusinessException(100005, '导出审计日志失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 单条审计详情（含 detail JSON 与 UA），供列表行展开查看 */
  @Get('audit-logs/:id')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditDetail(@Param('id') id: string) {
    try {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        throw new BusinessException(100002, '无效的日志 ID');
      }
      const row = await this.auditLogRepository.findById(numericId);
      if (!row) throw new BusinessException(100004, '审计日志不存在', HttpStatus.NOT_FOUND);
      return {
        ...AdminController.toAuditItem(row),
        userAgent: row.user_agent,
        moduleLabel: AUDIT_MODULE_LABELS[row.module ?? moduleOfAction(row.action)] ?? null,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('audit detail failed', err);
      throw new BusinessException(100005, '获取审计日志详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
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
      this.writeAudit(req, user, AUDIT_ACTIONS.DEMO_REQUEST_PROCESS, 'demo_request', id, {
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
        this.writeAudit(req, user, AUDIT_ACTIONS.SECURITY_POLICY_UPDATE, 'system_config', u.key, { value: u.value });
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
      this.writeAudit(req, user, AUDIT_ACTIONS.SESSION_REVOKE, 'auth_session', sessionId);
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('revoke session failed', err);
      throw new BusinessException(100005, '撤销会话失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
