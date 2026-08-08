import { HttpStatus, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { DocumentRepository } from '../../repositories/document.repository';
import { BaseDashboardRepository } from '../../repositories/base-dashboard.repository';
import { documentAccessFromAuth } from '../../utils/documentAccessContext';
import type { BaseDashboardEntity } from '../../database/entities/base.entity';
import type {
  CreateDashboardBody,
  DashboardListResponseDto,
  DashboardModelDto,
  ImportFromWorkbookBody,
  UpdateDashboardBody,
} from './dto/dashboard.dto';

const DEFAULT_LAYOUT = { columns: 12, rowHeight: 40, gap: 12 };

@Injectable()
export class BaseDashboardService {
  constructor(
    private readonly dashboardRepo: BaseDashboardRepository,
    private readonly documentRepo: DocumentRepository,
  ) {}

  async list(docId: string, auth: AuthUser): Promise<DashboardListResponseDto> {
    await this.assertCanRead(docId, auth);
    const [rows, prefs] = await Promise.all([
      this.dashboardRepo.listByDoc(docId),
      this.dashboardRepo.getPrefs(docId),
    ]);
    const dashboards = rows.map(toDto);
    let activeDashboardId = prefs?.activeDashboardId ?? null;
    if (activeDashboardId && !dashboards.some(d => d.id === activeDashboardId)) {
      activeDashboardId = dashboards[0]?.id ?? null;
    }
    return { dashboards, activeDashboardId };
  }

  async get(docId: string, dashboardId: string, auth: AuthUser): Promise<DashboardModelDto> {
    await this.assertCanRead(docId, auth);
    const row = await this.dashboardRepo.findById(docId, dashboardId);
    if (!row) {
      throw new BusinessException(240002, '仪表盘不存在', HttpStatus.NOT_FOUND);
    }
    return toDto(row);
  }

  async create(docId: string, auth: AuthUser, body: CreateDashboardBody): Promise<DashboardModelDto> {
    await this.assertCanWrite(docId, auth);
    if (!body?.sourceSheetId?.trim()) {
      throw new BusinessException(100002, '缺少 sourceSheetId');
    }

    const existing = await this.dashboardRepo.listByDoc(docId);
    const id = (typeof body.id === 'string' && body.id.trim())
      ? body.id.trim()
      : `dash_${Date.now().toString(36)}`;

    if (existing.some(d => d.id === id)) {
      throw new BusinessException(240003, '仪表盘 ID 已存在', HttpStatus.CONFLICT);
    }

    const layout = {
      columns: body.layout?.columns ?? DEFAULT_LAYOUT.columns,
      rowHeight: body.layout?.rowHeight ?? DEFAULT_LAYOUT.rowHeight,
      gap: body.layout?.gap ?? DEFAULT_LAYOUT.gap,
    };

    const row = await this.dashboardRepo.create({
      id,
      docId,
      name: (body.name?.trim() || `仪表盘 ${existing.length + 1}`),
      sourceSheetId: body.sourceSheetId.trim(),
      layout,
      widgets: Array.isArray(body.widgets) ? body.widgets : [],
      globalFilters: Array.isArray(body.globalFilters) ? body.globalFilters : null,
      sortOrder: existing.length,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });

    if (body.setActive !== false || existing.length === 0) {
      await this.dashboardRepo.setActiveDashboardId(docId, row.id, auth.userId);
    }

    return toDto(row);
  }

  async update(
    docId: string,
    dashboardId: string,
    auth: AuthUser,
    body: UpdateDashboardBody,
  ): Promise<DashboardModelDto> {
    await this.assertCanWrite(docId, auth);
    const row = await this.dashboardRepo.findById(docId, dashboardId);
    if (!row) {
      throw new BusinessException(240002, '仪表盘不存在', HttpStatus.NOT_FOUND);
    }

    if (typeof body.version === 'number' && body.version < row.version) {
      throw new BusinessException(240004, '仪表盘版本冲突，请刷新后重试', HttpStatus.CONFLICT);
    }

    const layout = body.layout
      ? {
          columns: body.layout.columns ?? row.layout.columns,
          rowHeight: body.layout.rowHeight ?? row.layout.rowHeight,
          gap: body.layout.gap ?? row.layout.gap,
        }
      : row.layout;

    const updated = await this.dashboardRepo.update(row, {
      name: body.name?.trim() || row.name,
      sourceSheetId: body.sourceSheetId?.trim() || row.sourceSheetId,
      layout,
      widgets: Array.isArray(body.widgets) ? body.widgets : row.widgets,
      globalFilters: body.globalFilters === undefined
        ? row.globalFilters
        : (Array.isArray(body.globalFilters) ? body.globalFilters : null),
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : row.sortOrder,
      version: row.version + 1,
      updatedBy: auth.userId,
    });

    return toDto(updated);
  }

  async remove(docId: string, dashboardId: string, auth: AuthUser): Promise<{ ok: true }> {
    await this.assertCanWrite(docId, auth);
    const row = await this.dashboardRepo.findById(docId, dashboardId);
    if (!row) {
      throw new BusinessException(240002, '仪表盘不存在', HttpStatus.NOT_FOUND);
    }
    await this.dashboardRepo.softDelete(row, auth.userId);

    const prefs = await this.dashboardRepo.getPrefs(docId);
    if (prefs?.activeDashboardId === dashboardId) {
      const rest = await this.dashboardRepo.listByDoc(docId);
      await this.dashboardRepo.setActiveDashboardId(
        docId,
        rest[0]?.id ?? null,
        auth.userId,
      );
    }
    return { ok: true };
  }

  async setActive(
    docId: string,
    auth: AuthUser,
    activeDashboardId: string | null,
  ): Promise<{ activeDashboardId: string | null }> {
    await this.assertCanWrite(docId, auth);
    if (activeDashboardId) {
      const row = await this.dashboardRepo.findById(docId, activeDashboardId);
      if (!row) {
        throw new BusinessException(240002, '仪表盘不存在', HttpStatus.NOT_FOUND);
      }
    }
    await this.dashboardRepo.setActiveDashboardId(docId, activeDashboardId, auth.userId);
    return { activeDashboardId };
  }

  /**
   * 从文档 Workbook 内嵌 dashboards 导入到独立表（一次性迁移）。
   * 默认：库中已有数据则跳过。
   */
  async importFromWorkbook(
    docId: string,
    auth: AuthUser,
    body: ImportFromWorkbookBody,
  ): Promise<DashboardListResponseDto> {
    await this.assertCanWrite(docId, auth);

    const existing = await this.dashboardRepo.listByDoc(docId);
    if (existing.length > 0 && !body.overwrite) {
      return this.list(docId, auth);
    }

    if (body.overwrite) {
      await this.dashboardRepo.hardDeleteAllByDoc(docId);
    }

    const incoming = Array.isArray(body.dashboards) ? body.dashboards : [];
    for (let i = 0; i < incoming.length; i += 1) {
      const d = incoming[i];
      if (!d?.id || !d.sourceSheetId) continue;
      await this.dashboardRepo.create({
        id: String(d.id),
        docId,
        name: d.name || `仪表盘 ${i + 1}`,
        sourceSheetId: String(d.sourceSheetId),
        layout: {
          columns: d.layout?.columns ?? DEFAULT_LAYOUT.columns,
          rowHeight: d.layout?.rowHeight ?? DEFAULT_LAYOUT.rowHeight,
          gap: d.layout?.gap ?? DEFAULT_LAYOUT.gap,
        },
        widgets: Array.isArray(d.widgets) ? d.widgets : [],
        globalFilters: Array.isArray(d.globalFilters) ? d.globalFilters : null,
        version: typeof d.version === 'number' ? d.version : 1,
        sortOrder: i,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      });
    }

    const activeId = body.activeDashboardId
      ?? incoming[0]?.id
      ?? null;
    if (activeId) {
      await this.dashboardRepo.setActiveDashboardId(docId, String(activeId), auth.userId);
    }

    return this.list(docId, auth);
  }

  private async assertCanRead(docId: string, auth: AuthUser): Promise<void> {
    const ctx = documentAccessFromAuth(auth);
    const doc = await this.documentRepo.findAccessibleById(docId, ctx);
    if (!doc) {
      throw new BusinessException(200001, '文档不存在或无权访问', HttpStatus.NOT_FOUND);
    }
  }

  private async assertCanWrite(docId: string, auth: AuthUser): Promise<void> {
    await this.assertCanRead(docId, auth);
    const ctx = documentAccessFromAuth(auth);
    const canWrite = await this.documentRepo.hasWriteAccess(docId, ctx);
    if (!canWrite) {
      throw new BusinessException(240001, '无仪表盘编辑权限', HttpStatus.FORBIDDEN);
    }
  }
}

function toDto(row: BaseDashboardEntity): DashboardModelDto {
  return {
    id: row.id,
    name: row.name,
    sourceSheetId: row.sourceSheetId,
    layout: row.layout ?? DEFAULT_LAYOUT,
    widgets: Array.isArray(row.widgets) ? (row.widgets as DashboardModelDto['widgets']) : [],
    globalFilters: Array.isArray(row.globalFilters) ? row.globalFilters : undefined,
    version: row.version,
    createdAt: row.createdAt?.getTime?.() ?? Date.now(),
    updatedAt: row.updatedAt?.getTime?.() ?? Date.now(),
    sortOrder: row.sortOrder,
  };
}
