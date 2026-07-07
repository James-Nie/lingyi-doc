import type { DocBlock, TableCell } from '../../doc/types';
import { createEmptyTableCell, fitTableColumnWidths, genBlockId, DOC_TABLE_DEFAULT_ROW_HEIGHT } from '../../doc/utils';
import {
  elementsByLocalName,
  firstByLocalName,
  readZipText,
} from './docxZip';

type JSZip = import('jszip');

function readChartText(el: Element | null): string {
  if (!el) return '';
  const v = firstByLocalName(el, 'v');
  if (v?.textContent) return v.textContent.trim();
  return el.textContent?.trim() ?? '';
}

function collectSeries(chartRoot: Element): Array<{ name: string; categories: string[]; values: number[] }> {
  const series: Array<{ name: string; categories: string[]; values: number[] }> = [];
  for (const ser of elementsByLocalName(chartRoot, 'ser')) {
    const tx = firstByLocalName(ser, 'tx');
    const name = readChartText(tx ? firstByLocalName(tx, 'strRef') : null)
      || readChartText(tx ? firstByLocalName(tx, 'v') : null)
      || '系列';

    const cat = firstByLocalName(ser, 'cat');
    const catRef = cat ? firstByLocalName(cat, 'strRef') : null;
    const catPts = elementsByLocalName(catRef ?? ser, 'pt');

    const val = firstByLocalName(ser, 'val');
    const valRef = val ? firstByLocalName(val, 'numRef') : null;
    const valPts = elementsByLocalName(valRef ?? ser, 'pt');

    const categories = catPts
      .sort((a, b) => Number(a.getAttribute('idx') ?? 0) - Number(b.getAttribute('idx') ?? 0))
      .map(pt => readChartText(firstByLocalName(pt, 'v')) || pt.textContent?.trim() || '');

    const values = valPts
      .sort((a, b) => Number(a.getAttribute('idx') ?? 0) - Number(b.getAttribute('idx') ?? 0))
      .map(pt => Number(readChartText(firstByLocalName(pt, 'v')) || 0));

    if (categories.length || values.length) {
      series.push({ name, categories, values });
    }
  }
  return series;
}

function chartSeriesToTableBlock(
  series: Array<{ name: string; categories: string[]; values: number[] }>,
  title?: string,
): DocBlock {
  const catLen = Math.max(...series.map(s => s.categories.length), 0);
  const categories = Array.from({ length: catLen }, (_, i) => series[0]?.categories[i] ?? `项${i + 1}`);

  const rows = categories.length + 1;
  const cols = series.length + 1;
  const cells: TableCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => createEmptyTableCell()),
  );

  cells[0][0] = { ...createEmptyTableCell(), text: title || '类别' };
  series.forEach((s, i) => {
    cells[0][i + 1] = { ...createEmptyTableCell(), text: s.name };
  });

  categories.forEach((cat, r) => {
    cells[r + 1][0] = { ...createEmptyTableCell(), text: cat };
    series.forEach((s, c) => {
      const val = s.values[r];
      cells[r + 1][c + 1] = {
        ...createEmptyTableCell(),
        text: val == null || Number.isNaN(val) ? '' : String(val),
      };
    });
  });

  return {
    type: 'table',
    id: genBlockId(),
    rows,
    cols,
    cells,
    columnWidths: fitTableColumnWidths(cols),
    rowHeights: Array.from({ length: rows }, () => DOC_TABLE_DEFAULT_ROW_HEIGHT),
  };
}

/** 将 chart XML 转为表格块（无预览图时的兜底） */
export async function chartXmlToTableBlock(zip: JSZip, chartPath: string): Promise<DocBlock | null> {
  const xml = await readZipText(zip, chartPath);
  if (!xml) return null;

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const chartRoot = firstByLocalName(doc, 'chart') ?? doc.documentElement;
  const titleEl = firstByLocalName(chartRoot, 'title');
  const title = readChartText(titleEl ? firstByLocalName(titleEl, 'tx') : null)
    || readChartText(titleEl)
    || '图表数据';

  const series = collectSeries(chartRoot);
  if (!series.length) return null;
  return chartSeriesToTableBlock(series, title);
}

export function isChartGraphicData(el: Element): boolean {
  const uri = el.getAttribute('uri') ?? '';
  return uri.includes('/chart');
}

export function findChartRelationshipId(root: Element): string | null {
  for (const graphicData of elementsByLocalName(root, 'graphicData')) {
    if (!isChartGraphicData(graphicData)) continue;
    const chart = firstByLocalName(graphicData, 'chart');
    const rid = chart?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      ?? chart?.getAttribute('r:id');
    if (rid) return rid;
  }
  return null;
}
