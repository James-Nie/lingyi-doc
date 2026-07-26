import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
      const result = await this.userRepository.listByType('admin', {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const roleMap = await this.adminRoleRepository.getUsersRoles(
        result.items.map((item) => item.id),
      );
      const items = result.items.map((item) => ({
        ...item,
        roles: roleMap.get(item.id) ?? [],
      }));
      return { items, total: result.total, page, pageSize };
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
}
