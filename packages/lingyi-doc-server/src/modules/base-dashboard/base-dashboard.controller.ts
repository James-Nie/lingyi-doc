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
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { BaseDashboardService } from './base-dashboard.service';
import type {
  CreateDashboardBody,
  ImportFromWorkbookBody,
  SetActiveDashboardBody,
  UpdateDashboardBody,
} from './dto/dashboard.dto';

/**
 * Base 仪表盘 CRUD（与管理后台运营 DashboardService 无关）
 * 路由挂在文档下，权限跟随文档读写。
 */
@Controller(['api/v1/c/docs', 'api/v1/docs'])
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class BaseDashboardController {
  private readonly logger = new Logger(BaseDashboardController.name);

  constructor(private readonly dashboardService: BaseDashboardService) {}

  @Get(':docId/dashboards')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
  ) {
    try {
      return await this.dashboardService.list(docId, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('list dashboards failed', err);
      throw new BusinessException(100005, '获取仪表盘列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':docId/dashboards/active')
  async setActive(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: SetActiveDashboardBody,
  ) {
    try {
      const activeDashboardId = body?.activeDashboardId ?? null;
      return await this.dashboardService.setActive(docId, user, activeDashboardId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('set active dashboard failed', err);
      throw new BusinessException(100005, '切换仪表盘失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/dashboards/import')
  async importFromWorkbook(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: ImportFromWorkbookBody,
  ) {
    try {
      return await this.dashboardService.importFromWorkbook(docId, user, body ?? {});
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('import dashboards failed', err);
      throw new BusinessException(100005, '导入仪表盘失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/dashboards')
  async create(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: CreateDashboardBody,
  ) {
    try {
      return await this.dashboardService.create(docId, user, body ?? ({} as CreateDashboardBody));
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create dashboard failed', err);
      throw new BusinessException(100005, '创建仪表盘失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':docId/dashboards/:dashboardId')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('dashboardId') dashboardId: string,
  ) {
    try {
      return await this.dashboardService.get(docId, dashboardId, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('get dashboard failed', err);
      throw new BusinessException(100005, '获取仪表盘失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':docId/dashboards/:dashboardId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() body: UpdateDashboardBody,
  ) {
    try {
      return await this.dashboardService.update(docId, dashboardId, user, body ?? {});
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update dashboard failed', err);
      throw new BusinessException(100005, '更新仪表盘失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':docId/dashboards/:dashboardId')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('dashboardId') dashboardId: string,
  ) {
    try {
      return await this.dashboardService.remove(docId, dashboardId, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete dashboard failed', err);
      throw new BusinessException(100005, '删除仪表盘失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
