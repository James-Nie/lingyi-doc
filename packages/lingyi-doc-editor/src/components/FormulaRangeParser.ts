// ============================================================
// FormulaRangeParser — 从公式文本中提取单元格引用和范围引用
// ============================================================

export interface ParsedRange {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

/** 将列字母转为 0-based 索引 */
function colToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.toUpperCase().charCodeAt(i) - 64);
  }
  return n - 1;
}

/**
 * 从公式文本中提取所有单元格引用和范围引用
 * 例如 "=SUM(A1:B10)+C5" → [{start: A1, end: B10}, {start: C5, end: C5}]
 */
export function parseFormulaRanges(formula: string): ParsedRange[] {
  if (!formula) return [];

  const text = formula.startsWith('=') ? formula.slice(1) : formula;
  const ranges: ParsedRange[] = [];
  const seen = new Set<string>();

  // Match range references like A1:B10 or A1
  // Also match partial references (while typing): A1:B or A:
  const rangeRegex = /\b([A-Za-z]+)(\d+)?(?:\s*:\s*([A-Za-z]+)(\d+)?)?\b/g;
  let match;

  while ((match = rangeRegex.exec(text)) !== null) {
    const [full, col1, row1, col2, row2] = match;

    // Skip if this looks like a function name (e.g., "SUM" in SUM(A1:B10))
    // Function names are followed by '('
    const beforeMatch = text[match.index - 1];
    const afterFull = text[match.index + full.length];
    if (beforeMatch === undefined || afterFull === '(') {
      continue;
    }

    // Also skip if the match is a function keyword
    const funcKeywords = new Set([
      'SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MAX', 'MIN', 'IF', 'AND', 'OR',
      'NOT', 'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'LEFT', 'RIGHT', 'MID',
      'LEN', 'TRIM', 'UPPER', 'LOWER', 'CONCAT', 'ABS', 'ROUND', 'INT',
      'MOD', 'POWER', 'SQRT', 'TODAY', 'NOW', 'YEAR', 'MONTH', 'DAY',
      'TRUE', 'FALSE', 'SUMIF', 'COUNTIF', 'AVERAGEIF', 'IFERROR', 'IFNA',
      'ISNUMBER', 'ISTEXT', 'ISBLANK', 'FIND', 'REPLACE', 'SUBSTITUTE',
      'TEXT', 'VALUE', 'MEDIAN', 'MODE', 'STDEV', 'VAR', 'RAND', 'RANDBETWEEN',
      'CEILING', 'FLOOR', 'EXP', 'FACT', 'LOG', 'LN', 'COS', 'SIN', 'TAN',
      'FV', 'PV', 'PMT', 'NPV', 'IRR', 'SLN', 'NPER', 'RATE',
    ]);
    if (funcKeywords.has(full.toUpperCase()) && beforeMatch === undefined && afterFull === '(') {
      continue;
    }

    const c1 = colToIndex(col1);
    const r1 = row1 ? parseInt(row1) - 1 : 0; // 0-based

    if (col2) {
      const c2 = colToIndex(col2);
      const r2 = row2 ? parseInt(row2) - 1 : r1;
      const key = `${Math.min(c1, c2)},${Math.min(r1, r2)}-${Math.max(c1, c2)},${Math.max(r1, r2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push({
          startCol: Math.min(c1, c2),
          endCol: Math.max(c1, c2),
          startRow: Math.min(r1, r2),
          endRow: Math.max(r1, r2),
        });
      }
    } else if (row1 && !col2) {
      // Single cell reference
      const key = `${c1},${r1}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push({
          startCol: c1,
          endCol: c1,
          startRow: r1,
          endRow: r1,
        });
      }
    }
  }

  return ranges;
}
