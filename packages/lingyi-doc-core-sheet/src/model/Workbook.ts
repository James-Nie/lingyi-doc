import { FreeTable } from './index';
import { normalizeSheetType } from '../utils/sheetType';
import { isBaseSheet, isFreeformSheet } from '@lingyi-doc/core-types';
import type { ActiveSheetType, DashboardModel } from '@lingyi-doc/core-types';

export interface SheetInfo {
  id: string;
  name: string;
  type: ActiveSheetType;
  table: FreeTable;
}

export class Workbook {
  private _sheets: Map<string, FreeTable> = new Map();
  private _sheetOrder: string[] = [];
  private _activeSheetId: string = '';
  private _dashboards: DashboardModel[] = [];
  private _activeDashboardId: string | undefined;
  private _changeListeners: Array<() => void> = [];

  constructor() {}

  get sheets(): SheetInfo[] {
    return this._sheetOrder.map(id => ({
      id,
      name: this._sheets.get(id)!.name,
      type: normalizeSheetType(this._sheets.get(id)!.sheet.type),
      table: this._sheets.get(id)!,
    }));
  }

  get activeSheet(): FreeTable | null {
    return this._sheets.get(this._activeSheetId) || null;
  }

  get activeSheetId(): string { return this._activeSheetId; }

  get dashboards(): DashboardModel[] {
    return this._dashboards;
  }

  get activeDashboardId(): string | undefined {
    return this._activeDashboardId;
  }

  getSheet(id: string): FreeTable | null {
    return this._sheets.get(id) || null;
  }

  getDashboard(id: string): DashboardModel | null {
    return this._dashboards.find(d => d.id === id) || null;
  }

  setDashboards(dashboards: DashboardModel[]): void {
    this._dashboards = dashboards;
    if (this._activeDashboardId && !dashboards.some(d => d.id === this._activeDashboardId)) {
      this._activeDashboardId = undefined;
    }
    this._notify();
  }

  addDashboard(dashboard: DashboardModel): string {
    this._dashboards = [...this._dashboards, dashboard];
    this._activeDashboardId = dashboard.id;
    this._notify();
    return dashboard.id;
  }

  updateDashboard(id: string, patch: Partial<DashboardModel>): boolean {
    const idx = this._dashboards.findIndex(d => d.id === id);
    if (idx < 0) return false;
    const next = {
      ...this._dashboards[idx],
      ...patch,
      id,
      updatedAt: Date.now(),
      version: (this._dashboards[idx].version || 1) + 1,
    };
    this._dashboards = [
      ...this._dashboards.slice(0, idx),
      next,
      ...this._dashboards.slice(idx + 1),
    ];
    this._notify();
    return true;
  }

  /** 用服务端权威数据整体替换，不自增 version */
  replaceDashboard(dashboard: DashboardModel): boolean {
    const idx = this._dashboards.findIndex(d => d.id === dashboard.id);
    if (idx < 0) {
      this._dashboards = [...this._dashboards, dashboard];
      this._notify();
      return true;
    }
    this._dashboards = [
      ...this._dashboards.slice(0, idx),
      dashboard,
      ...this._dashboards.slice(idx + 1),
    ];
    this._notify();
    return true;
  }

  removeDashboard(id: string): boolean {
    const next = this._dashboards.filter(d => d.id !== id);
    if (next.length === this._dashboards.length) return false;
    this._dashboards = next;
    if (this._activeDashboardId === id) {
      this._activeDashboardId = next[0]?.id;
    }
    this._notify();
    return true;
  }

  switchDashboard(id: string | undefined): void {
    if (id === undefined || this._dashboards.some(d => d.id === id)) {
      this._activeDashboardId = id;
      this._notify();
    }
  }

  addSheet(name?: string, type?: ActiveSheetType): string {
    const id = `sheet_${Date.now()}`;
    const sheetName = name || `Sheet${this._sheets.size + 1}`;
    const sheetType = normalizeSheetType(type);
    const table = new FreeTable({ sheetId: id, name: sheetName, type: sheetType, rowCount: 200, colCount: 30 });
    this._sheets.set(id, table);
    this._sheetOrder.push(id);
    this._activeSheetId = id;
    this._notify();
    return id;
  }

  removeSheet(id: string): boolean {
    if (this._sheets.size <= 1) return false;
    this._sheets.delete(id);
    this._sheetOrder = this._sheetOrder.filter(s => s !== id);
    if (this._activeSheetId === id) {
      this._activeSheetId = this._sheetOrder[0] || '';
    }
    this._notify();
    return true;
  }

  switchSheet(id: string): void {
    if (this._sheets.has(id)) {
      this._activeSheetId = id;
      this._notify();
    }
  }

  renameSheet(id: string, name: string): void {
    const sheet = this._sheets.get(id);
    if (sheet) {
      sheet.setName(name);
      this._notify();
    }
  }

  onChange(listener: () => void): () => void {
    this._changeListeners.push(listener);
    return () => {
      this._changeListeners = this._changeListeners.filter(l => l !== listener);
    };
  }

  toJSON(options?: { includeHistory?: boolean }): object {
    this.prepareForSave();
    const uniqueOrder = Workbook._dedupeIds(this._sheetOrder.filter(id => this._sheets.has(id)));
    return {
      activeSheetId: this._activeSheetId,
      sheetOrder: uniqueOrder,
      sheets: uniqueOrder.map(id => ({
        id,
        data: this._sheets.get(id)!.toJSON(options),
      })),
      // 仪表盘独立接口存储，不写入文档 JSON（打开文档不拉仪表盘，切换时再请求）
      dashboards: [],
      activeDashboardId: undefined,
    };
  }

  static fromJSON(data: any): Workbook {
    const wb = new Workbook();
    const seen = new Set<string>();

    for (const s of data.sheets || []) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      wb._sheets.set(s.id, FreeTable.fromJSON(s.data));
    }

    const orderFromData = Array.isArray(data.sheetOrder) ? data.sheetOrder : [];
    const finalOrder: string[] = [];
    const orderSeen = new Set<string>();
    for (const id of orderFromData) {
      if (seen.has(id) && !orderSeen.has(id)) {
        finalOrder.push(id);
        orderSeen.add(id);
      }
    }
    for (const id of seen) {
      if (!orderSeen.has(id)) finalOrder.push(id);
    }

    wb._sheetOrder = finalOrder;
    wb._activeSheetId = seen.has(data.activeSheetId) ? data.activeSheetId : finalOrder[0] || '';

    if (Array.isArray(data.dashboards)) {
      wb._dashboards = data.dashboards.filter((d: DashboardModel) => d && typeof d.id === 'string');
      const activeId = data.activeDashboardId;
      wb._activeDashboardId =
        typeof activeId === 'string' && wb._dashboards.some(d => d.id === activeId)
          ? activeId
          : undefined;
    }
    return wb;
  }

  /** 加载后修复多维表结构（兼容旧数据；不得把已持久化的普通表升级为多维表） */
  normalizeAfterLoad(docType?: string): void {
    this._sheetOrder = Workbook._dedupeIds(this._sheetOrder.filter(id => this._sheets.has(id)));

    if (this._sheetOrder.length === 0) {
      this.addSheet('Sheet1');
      return;
    }

    if (!this._sheets.has(this._activeSheetId)) {
      this._activeSheetId = this._sheetOrder[0] ?? '';
    }

    const hasBaseSheet = this._sheetOrder.some(id => isBaseSheet(this._sheets.get(id)!.sheet));

    for (const id of this._sheetOrder) {
      const table = this._sheets.get(id)!;
      const sheet = table.sheet;

      if (isBaseSheet(sheet)) {
        if (sheet.columnDefs.length === 0) {
          table.repairBaseSchema();
        } else {
          table.syncColumnLayout();
        }
      }
    }

    // 旧版单 sheet 文档：docType=base 但 sheet 未标 type=base
    if (docType === 'base' && !hasBaseSheet && this._sheetOrder.length === 1) {
      const only = this._sheets.get(this._sheetOrder[0]);
      if (only && isFreeformSheet(only.sheet)) {
        only.repairBaseSchema();
      }
    }

    if (docType === 'base' && hasBaseSheet) {
      const active = this.activeSheet;
      if (!active || !isBaseSheet(active.sheet)) {
        const baseSheetId = this._sheetOrder.find(id => isBaseSheet(this._sheets.get(id)!.sheet));
        if (baseSheetId) {
          this._activeSheetId = baseSheetId;
        }
      } else {
        active.syncColumnLayout();
      }
    }
  }

  /** 保存前同步列布局 */
  prepareForSave(): void {
    this._sheetOrder = Workbook._dedupeIds(this._sheetOrder.filter(id => this._sheets.has(id)));
    for (const id of this._sheetOrder) {
      const table = this._sheets.get(id);
      if (table?.sheet.type === 'base') {
        table.syncColumnLayout();
      }
    }
  }

  private static _dedupeIds(ids: string[]): string[] {
    const seen = new Set<string>();
    return ids.filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  static create(): Workbook {
    const wb = new Workbook();
    wb.addSheet('Sheet1');
    return wb;
  }

  private _notify(): void {
    for (const l of this._changeListeners) l();
  }
}
