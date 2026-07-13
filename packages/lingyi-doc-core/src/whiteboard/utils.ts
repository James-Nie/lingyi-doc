import type {
  WhiteboardElement,
  WhiteboardJSON,
  WhiteboardViewport,
  WhiteboardPoint,
  ConnectorBind,
  ConnectorLabelPosition,
} from './types';
import { normalizeMindNode, WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '../mindnote/utils';

let idCounter = 0;

export function genWhiteboardId(prefix = 'wb'): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

const DEFAULT_VIEWPORT: WhiteboardViewport = { x: 0, y: 0, zoom: 1 };

export function createEmptyWhiteboard(documentId = '', title = '未命名画板'): WhiteboardJSON {
  return {
    documentId,
    title,
    viewport: { ...DEFAULT_VIEWPORT },
    elements: [],
  };
}

export function cloneWhiteboardElement(el: WhiteboardElement): WhiteboardElement {
  return JSON.parse(JSON.stringify(el)) as WhiteboardElement;
}

export function cloneWhiteboardElements(elements: WhiteboardElement[]): WhiteboardElement[] {
  return elements.map(cloneWhiteboardElement);
}

function normalizeElement(raw: unknown, index: number): WhiteboardElement {
  const e = raw as Partial<WhiteboardElement> & { type?: string };
  const base = {
    id: e.id || genWhiteboardId(),
    x: typeof e.x === 'number' ? e.x : 0,
    y: typeof e.y === 'number' ? e.y : 0,
    width: typeof e.width === 'number' ? e.width : 120,
    height: typeof e.height === 'number' ? e.height : 80,
    rotation: typeof e.rotation === 'number' ? e.rotation : undefined,
    flipX: !!(e as { flipX?: boolean }).flipX,
    flipY: !!(e as { flipY?: boolean }).flipY,
    zIndex: typeof e.zIndex === 'number' ? e.zIndex : index,
    locked: !!e.locked,
  };

  switch (e.type) {
    case 'shape':
      return {
        ...base,
        type: 'shape',
        shapeKind: (e as { shapeKind?: string }).shapeKind || 'rect',
        fill: (e as { fill?: string }).fill ?? '#e8f0fe',
        stroke: (e as { stroke?: string }).stroke ?? '#3370ff',
        strokeWidth: (e as { strokeWidth?: number }).strokeWidth ?? 2,
        text: (e as { text?: string }).text,
        fontSize: (e as { fontSize?: number }).fontSize,
        textColor: (e as { textColor?: string }).textColor,
        textAlign: (e as { textAlign?: 'left' | 'center' | 'right' }).textAlign,
        textVerticalAlign: (e as { textVerticalAlign?: 'top' | 'center' | 'bottom' }).textVerticalAlign,
        fontWeight: (e as { fontWeight?: number }).fontWeight,
        fontStyle: (e as { fontStyle?: 'normal' | 'italic' }).fontStyle,
        textUnderline: (e as { textUnderline?: boolean }).textUnderline,
        textLineThrough: (e as { textLineThrough?: boolean }).textLineThrough,
        textHighlight: (e as { textHighlight?: string }).textHighlight,
        textLineHighlights: (e as { textLineHighlights?: string[] }).textLineHighlights,
      } as WhiteboardElement;
    case 'text':
      return {
        ...base,
        type: 'text',
        text: (e as { text?: string }).text ?? '',
        fontSize: (e as { fontSize?: number }).fontSize ?? 16,
        color: (e as { color?: string }).color ?? '#1f2329',
        fontWeight: (e as { fontWeight?: number }).fontWeight,
        fontStyle: (e as { fontStyle?: 'normal' | 'italic' }).fontStyle,
        textUnderline: (e as { textUnderline?: boolean }).textUnderline,
        textLineThrough: (e as { textLineThrough?: boolean }).textLineThrough,
        textAlign: (e as { textAlign?: 'left' | 'center' | 'right' }).textAlign,
        textVerticalAlign: (e as { textVerticalAlign?: 'top' | 'center' | 'bottom' }).textVerticalAlign,
        textHighlight: (e as { textHighlight?: string }).textHighlight,
      } as WhiteboardElement;
    case 'sticky':
      return {
        ...base,
        type: 'sticky',
        text: (e as { text?: string }).text ?? '',
        color: (e as { color?: string }).color ?? '#fff9c4',
      } as WhiteboardElement;
    case 'connector':
      return {
        ...base,
        type: 'connector',
        style: (e as { style?: string }).style || 'arrow',
        points: Array.isArray((e as { points?: unknown }).points)
          ? (e as { points: { x?: number; y?: number; kind?: string; handleIn?: WhiteboardPoint | null; handleOut?: WhiteboardPoint | null }[] }).points.map((p, i, arr) => ({
            x: p.x ?? 0,
            y: p.y ?? 0,
            kind: p.kind as import('./types').PathPointKind | undefined,
            handleIn: p.handleIn ?? null,
            handleOut: p.handleOut ?? null,
          }))
          : [{ x: base.x, y: base.y }, { x: base.x + base.width, y: base.y + base.height }],
        stroke: (e as { stroke?: string }).stroke ?? '#1f2329',
        strokeWidth: (e as { strokeWidth?: number }).strokeWidth ?? 2,
        arrowEnd: (e as { arrowEnd?: boolean }).arrowEnd !== false,
        startBind: (e as { startBind?: ConnectorBind }).startBind,
        endBind: (e as { endBind?: ConnectorBind }).endBind,
        text: (e as { text?: string }).text,
        labelPosition: (e as { labelPosition?: string }).labelPosition as ConnectorLabelPosition | undefined,
      } as WhiteboardElement;
    case 'section':
      return {
        ...base,
        type: 'section',
        title: (e as { title?: string }).title ?? '分区',
        aspect: (e as { aspect?: string }).aspect || 'custom',
        fill: (e as { fill?: string }).fill ?? '#fafafa',
        stroke: (e as { stroke?: string }).stroke ?? '#dee0e3',
      } as WhiteboardElement;
    case 'table': {
      const rows = (e as { rows?: number }).rows ?? 3;
      const cols = (e as { cols?: number }).cols ?? 3;
      const cells = (e as { cells?: string[][] }).cells;
      const normalizedCells = cells?.length
        ? cells
        : Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
      return {
        ...base,
        type: 'table',
        rows,
        cols,
        cells: normalizedCells,
        fontSize: (e as { fontSize?: number }).fontSize ?? 14,
        color: (e as { color?: string }).color ?? '#1f2329',
        textAlign: (e as { textAlign?: string }).textAlign ?? 'left',
        stroke: (e as { stroke?: string }).stroke ?? '#dee0e3',
        fill: (e as { fill?: string }).fill ?? '#ffffff',
      } as WhiteboardElement;
    }
    case 'pen':
      return {
        ...base,
        type: 'pen',
        mode: (e as { mode?: string }).mode || 'pen',
        points: Array.isArray((e as { points?: unknown }).points)
          ? (e as { points: { x?: number; y?: number }[] }).points.map(p => ({
            x: p.x ?? 0,
            y: p.y ?? 0,
          }))
          : [],
        color: (e as { color?: string }).color ?? '#e53935',
        strokeWidth: (e as { strokeWidth?: number }).strokeWidth ?? 3,
      } as WhiteboardElement;
    case 'mindmap':
      return {
        ...base,
        type: 'mindmap',
        layout: (e as { layout?: string }).layout || 'right',
        root: normalizeMindNode((e as { root?: unknown }).root),
        branchStyle: (e as { branchStyle?: string }).branchStyle === 'straight'
          ? 'straight'
          : WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
        zoom: typeof (e as { zoom?: number }).zoom === 'number' ? (e as { zoom: number }).zoom : 100,
      } as WhiteboardElement;
    case 'image':
      return {
        ...base,
        type: 'image',
        src: (e as { src?: string }).src ?? '',
        alt: (e as { alt?: string }).alt,
      } as WhiteboardElement;
    default:
      return {
        ...base,
        type: 'shape',
        shapeKind: 'rect',
        fill: '#e8f0fe',
        stroke: '#3370ff',
        strokeWidth: 2,
      } as WhiteboardElement;
  }
}

export function normalizeWhiteboardJSON(raw: unknown): WhiteboardJSON {
  const j = raw as Partial<WhiteboardJSON>;
  const vp = j.viewport ?? DEFAULT_VIEWPORT;
  const elements = Array.isArray(j.elements)
    ? j.elements.map((el, i) => normalizeElement(el, i))
    : [];
  return {
    documentId: j.documentId ?? '',
    title: j.title ?? '未命名画板',
    viewport: {
      x: vp.x ?? 0,
      y: vp.y ?? 0,
      zoom: vp.zoom ?? 1,
    },
    elements,
  };
}

export function normalizeWhiteboardData(
  data: WhiteboardJSON,
  docId: string,
  title?: string,
): WhiteboardJSON {
  const json = normalizeWhiteboardJSON(data);
  json.documentId = docId;
  if (title) json.title = title;
  return json;
}

export function nextZIndex(elements: WhiteboardElement[]): number {
  if (!elements.length) return 0;
  return Math.max(...elements.map(e => e.zIndex)) + 1;
}
