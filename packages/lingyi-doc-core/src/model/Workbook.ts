import { FreeTable } from './index';
import { normalizeSheetType } from '../utils/sheetType';
import { isBaseSheet, isFreeformSheet } from '../types/sheetGuards';
import type { ActiveSheetType } from '../types/index';

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

  getSheet(id: string): FreeTable | null {
    return this._sheets.get(id) || null;
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

  toJSON(): object {
    this.prepareForSave();
    const uniqueOrder = Workbook._dedupeIds(this._sheetOrder.filter(id => this._sheets.has(id)));
    return {
      activeSheetId: this._activeSheetId,
      sheetOrder: uniqueOrder,
      sheets: uniqueOrder.map(id => ({
        id,
        data: this._sheets.get(id)!.toJSON(),
      })),
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
