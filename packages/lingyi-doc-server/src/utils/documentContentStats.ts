/** 从文档 JSON 提取纯文本并统计字数/字符数 */
export function computeDocumentContentStats(
  data: unknown,
  docType: string,
): { wordCount: number; charCount: number } {
  const chunks: string[] = [];
  collectText(data, docType, chunks);
  const text = chunks.join('\n');
  const charCount = text.length;
  const wordCount = countWords(text);
  return { wordCount, charCount };
}

function collectText(value: unknown, docType: string, out: string[]): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value.trim()) out.push(value);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectText(item, docType, out));
    return;
  }
  if (typeof value !== 'object') return;

  const obj = value as Record<string, unknown>;

  if (docType === 'rich' || Array.isArray(obj.blocks)) {
    const blocks = obj.blocks;
    if (Array.isArray(blocks)) {
      blocks.forEach(block => collectBlockText(block, out));
    }
  }

  if (Array.isArray(obj.sheets) || obj.sheetId != null || obj.cells != null) {
    collectWorkbookText(obj, out);
  }

  for (const [key, nested] of Object.entries(obj)) {
    if (key === 'blocks' || key === 'sheets' || key === 'cells') continue;
    if (typeof nested === 'object' && nested != null) {
      collectText(nested, docType, out);
    }
  }
}

function collectBlockText(block: unknown, out: string[]): void {
  if (!block || typeof block !== 'object') return;
  const b = block as Record<string, unknown>;
  if (typeof b.text === 'string' && b.text.trim()) out.push(b.text);
  if (typeof b.caption === 'string' && b.caption.trim()) out.push(b.caption);
  if (Array.isArray(b.cells)) {
    b.cells.forEach(row => {
      if (!Array.isArray(row)) return;
      row.forEach(cell => {
        if (cell && typeof cell === 'object' && typeof (cell as Record<string, unknown>).text === 'string') {
          const text = (cell as Record<string, unknown>).text as string;
          if (text.trim()) out.push(text);
        }
      });
    });
  }
  if (b.sheetData && typeof b.sheetData === 'object') {
    collectWorkbookText(b.sheetData as Record<string, unknown>, out);
  }
  if (Array.isArray(b.children)) {
    b.children.forEach(child => collectBlockText(child, out));
  }
}

function collectWorkbookText(source: Record<string, unknown>, out: string[]): void {
  const sheets = source.sheets;
  if (sheets && typeof sheets === 'object' && !Array.isArray(sheets)) {
    Object.values(sheets as Record<string, unknown>).forEach(sheet => collectSheetText(sheet, out));
    return;
  }
  if (Array.isArray(sheets)) {
    sheets.forEach(sheet => collectSheetText(sheet, out));
    return;
  }
  collectSheetText(source, out);
}

function collectSheetText(sheet: unknown, out: string[]): void {
  if (!sheet || typeof sheet !== 'object') return;
  const s = sheet as Record<string, unknown>;
  const cells = s.cells;
  if (cells instanceof Map) {
    cells.forEach(cell => appendCellText(cell, out));
    return;
  }
  if (cells && typeof cells === 'object') {
    if (Array.isArray(cells)) {
      cells.forEach(cell => appendCellText(cell, out));
    } else {
      Object.values(cells as Record<string, unknown>).forEach(cell => appendCellText(cell, out));
    }
  }
  const rows = s.rows;
  if (Array.isArray(rows)) {
    rows.forEach(row => {
      if (!row || typeof row !== 'object') return;
      Object.entries(row as Record<string, unknown>).forEach(([key, val]) => {
        if (key.startsWith('_')) return;
        if (typeof val === 'string' && val.trim()) out.push(val);
      });
    });
  }
}

function appendCellText(cell: unknown, out: string[]): void {
  if (!cell || typeof cell !== 'object') return;
  const c = cell as Record<string, unknown>;
  const value = c.value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.text === 'string' && v.text.trim()) out.push(v.text);
    else if (typeof v.formula === 'string') out.push(v.formula);
    else if (v.type === 'number' && typeof v.value === 'number') out.push(String(v.value));
    else if (v.type === 'boolean') out.push(v.value ? 'true' : 'false');
  } else if (typeof c.text === 'string' && c.text.trim()) {
    out.push(c.text);
  }
}

function countWords(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const cjk = normalized.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const nonCjk = normalized.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ');
  const latinWords = nonCjk.split(/\s+/).filter(Boolean).length;
  return cjk + latinWords;
}

export function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
