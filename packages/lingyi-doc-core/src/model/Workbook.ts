import { FreeTable } from './index';

const BASE_FIELD_TYPES = new Set([
  'select', 'multiSelect', 'date', 'datetime', 'rating', 'progress',
  'attachment', 'user', 'boolean', 'autoNumber',
]);

export interface SheetInfo {
  id: string;
  name: string;
  type: 'freeform' | 'standard' | 'base';
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
      type: this._sheets.get(id)!.sheet.type,
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

  addSheet(name?: string, type?: 'freeform' | 'standard' | 'base'): string {
    const id = `sheet_${Date.now()}`;
    const sheetName = name || `Sheet${this._sheets.size + 1}`;
    const table = new FreeTable({ sheetId: id, name: sheetName, type: type || 'freeform', rowCount: 200, colCount: 30 });
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

  /** 加载后修复多维表结构（兼容旧数据、docType 与 sheet.type 不一致） */
  normalizeAfterLoad(docType?: string): void {
    this._sheetOrder = Workbook._dedupeIds(this._sheetOrder.filter(id => this._sheets.has(id)));

    if (this._sheetOrder.length === 0) {
      this.addSheet('Sheet1');
      return;
    }

    if (!this._sheets.has(this._activeSheetId)) {
      this._activeSheetId = this._sheetOrder[0] ?? '';
    }

    for (const id of this._sheetOrder) {
      const table = this._sheets.get(id)!;
      const sheet = table.sheet;

      if (sheet.columnDefs.length > 0 && sheet.type !== 'base') {
        const hasStructuredFields = sheet.columnDefs.some(c => BASE_FIELD_TYPES.has(c.type));
        if (hasStructuredFields || docType === 'base') {
          sheet.type = 'base';
        }
      }

      if (sheet.type === 'base') {
        if (sheet.columnDefs.length === 0) {
          table.repairBaseSchema();
        } else {
          table.syncColumnLayout();
        }
      }
    }

    if (docType === 'base') {
      const active = this.activeSheet;
      if (!active || active.sheet.type !== 'base') {
        const baseSheetId = this._sheetOrder.find(id => this._sheets.get(id)?.sheet.type === 'base');
        if (baseSheetId) {
          this._activeSheetId = baseSheetId;
        } else if (active) {
          active.repairBaseSchema();
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
