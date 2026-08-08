import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseDashboardEntity, BaseDashboardPrefsEntity } from '../database/entities/base.entity';

export interface DashboardRecordInput {
  id: string;
  docId: string;
  name: string;
  sourceSheetId: string;
  layout: { columns: number; rowHeight: number; gap: number };
  widgets: unknown[];
  globalFilters?: unknown[] | null;
  version?: number;
  sortOrder?: number;
  createdBy: string;
  updatedBy: string;
}

@Injectable()
export class BaseDashboardRepository {
  constructor(
    @InjectRepository(BaseDashboardEntity)
    private readonly dashboardRepo: Repository<BaseDashboardEntity>,
    @InjectRepository(BaseDashboardPrefsEntity)
    private readonly prefsRepo: Repository<BaseDashboardPrefsEntity>,
  ) {}

  listByDoc(docId: string): Promise<BaseDashboardEntity[]> {
    return this.dashboardRepo.find({
      where: { docId, isDeleted: false },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  findById(docId: string, id: string): Promise<BaseDashboardEntity | null> {
    return this.dashboardRepo.findOne({
      where: { id, docId, isDeleted: false },
    });
  }

  async create(input: DashboardRecordInput): Promise<BaseDashboardEntity> {
    const entity = this.dashboardRepo.create({
      id: input.id,
      docId: input.docId,
      name: input.name,
      sourceSheetId: input.sourceSheetId,
      layout: input.layout,
      widgets: input.widgets,
      globalFilters: input.globalFilters ?? null,
      version: input.version ?? 1,
      sortOrder: input.sortOrder ?? 0,
      createdBy: input.createdBy,
      updatedBy: input.updatedBy,
      isDeleted: false,
      deletedAt: null,
    });
    return this.dashboardRepo.save(entity);
  }

  async update(
    entity: BaseDashboardEntity,
    patch: Partial<Pick<BaseDashboardEntity, 'name' | 'sourceSheetId' | 'layout' | 'widgets' | 'globalFilters' | 'sortOrder' | 'version' | 'updatedBy'>>,
  ): Promise<BaseDashboardEntity> {
    Object.assign(entity, patch);
    return this.dashboardRepo.save(entity);
  }

  async softDelete(entity: BaseDashboardEntity, updatedBy: string): Promise<void> {
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.updatedBy = updatedBy;
    await this.dashboardRepo.save(entity);
  }

  /** 覆盖导入时物理删除该文档下全部仪表盘（含软删） */
  async hardDeleteAllByDoc(docId: string): Promise<void> {
    await this.dashboardRepo.delete({ docId });
  }

  async getPrefs(docId: string): Promise<BaseDashboardPrefsEntity | null> {
    return this.prefsRepo.findOne({ where: { docId } });
  }

  async setActiveDashboardId(
    docId: string,
    activeDashboardId: string | null,
    updatedBy: string,
  ): Promise<BaseDashboardPrefsEntity> {
    let prefs = await this.prefsRepo.findOne({ where: { docId } });
    if (!prefs) {
      prefs = this.prefsRepo.create({
        docId,
        activeDashboardId,
        updatedBy,
      });
    } else {
      prefs.activeDashboardId = activeDashboardId;
      prefs.updatedBy = updatedBy;
    }
    return this.prefsRepo.save(prefs);
  }

  async countByDoc(docId: string): Promise<number> {
    return this.dashboardRepo.count({
      where: { docId, isDeleted: false },
    });
  }
}
