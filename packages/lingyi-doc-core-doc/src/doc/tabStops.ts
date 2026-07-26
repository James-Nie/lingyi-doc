import type { TextMark } from './types';

/** 制表位对齐：左 / 居中 / 右 / 小数点 / 竖线 */
export type TabStopAlign = 'left' | 'center' | 'right' | 'decimal' | 'bar';

/** 制表位前导符（目录虚线等） */
export type TabLeader = 'none' | 'dot' | 'dash' | 'underline';

export interface TabStop {
  /** 距内容区左缘的像素位置 */
  position: number;
  align: TabStopAlign;
  leader?: TabLeader;
}

/** 默认制表位间距：0.74cm ≈ 28px（96dpi）≈ 两字符宽 */
export const DEFAULT_TAB_STOP_CM = 0.74;
export const DEFAULT_TAB_STOP_PX = Math.round((DEFAULT_TAB_STOP_CM / 2.54) * 96);

export function createDefaultTabStops(contentWidthPx = 720): TabStop[] {
  const stops: TabStop[] = [];
  for (let p = DEFAULT_TAB_STOP_PX; p < contentWidthPx; p += DEFAULT_TAB_STOP_PX) {
    stops.push({ position: p, align: 'left' });
  }
  return stops;
}

const DEFAULT_STOPS = createDefaultTabStops();

export function resolveTabStops(custom?: TabStop[] | null): TabStop[] {
  if (custom?.length) {
    return [...custom].sort((a, b) => a.position - b.position);
  }
  return DEFAULT_STOPS;
}

/** 光标是否在当前行行首（段首或软换行后） */
export function isCaretAtLineStart(text: string, offset: number): boolean {
  if (offset <= 0) return true;
  return text[offset - 1] === '\n';
}

/** 估算文本视觉宽度（混排中文/西文） */
export function measureTextWidthApprox(text: string, fontSizePx = 15): number {
  let w = 0;
  for (const ch of text) {
    if (ch === '\t') {
      w += DEFAULT_TAB_STOP_PX;
      continue;
    }
    w += /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(ch)
      ? fontSizePx
      : fontSizePx * 0.55;
  }
  return w;
}

function findNextStop(x: number, stops: TabStop[]): TabStop {
  for (const s of stops) {
    if (s.position > x + 0.5) return s;
  }
  const last = stops[stops.length - 1];
  const base = last?.position ?? 0;
  return {
    position: base + DEFAULT_TAB_STOP_PX,
    align: 'left',
  };
}

/**
 * 计算行内某个制表符应展开的占位宽度。
 * @param textBeforeOnLine 当前行、该制表符之前的文本
 * @param textAfter 制表符之后到行尾（或下一制表符）的文本，用于居中/右/小数点对齐
 */
export function computeTabSpanStyle(
  textBeforeOnLine: string,
  textAfter: string,
  stops: TabStop[],
  fontSizePx = 15,
): { width: number; align: TabStopAlign; leader: TabLeader } {
  const x = measureTextWidthApprox(textBeforeOnLine, fontSizePx);
  const stop = findNextStop(x, stops);
  const afterSeg = textAfter.split('\t')[0] ?? '';
  const afterW = measureTextWidthApprox(afterSeg, fontSizePx);
  const leader = stop.leader ?? 'none';

  let width: number;
  switch (stop.align) {
    case 'right':
      width = stop.position - x - afterW;
      break;
    case 'center':
      width = stop.position - x - afterW / 2;
      break;
    case 'decimal': {
      const dot = afterSeg.search(/[.,]/);
      const beforeDot = dot >= 0 ? afterSeg.slice(0, dot) : afterSeg;
      width = stop.position - x - measureTextWidthApprox(beforeDot, fontSizePx);
      break;
    }
    case 'bar':
    case 'left':
    default:
      width = stop.position - x;
      break;
  }

  return {
    width: Math.max(4, Math.round(width)),
    align: stop.align,
    leader,
  };
}

export function leaderCss(leader: TabLeader): string {
  switch (leader) {
    case 'dot':
      return 'border-bottom:1px dotted #86909C;';
    case 'dash':
      return 'border-bottom:1px dashed #86909C;';
    case 'underline':
      return 'border-bottom:1px solid #1F2329;';
    default:
      return '';
  }
}

/** 删除光标前一个制表符；若无可删制表符返回 null（marks 需调用方再 normalize） */
export function deleteTabBeforeCaret(
  text: string,
  marks: TextMark[],
  offset: number,
): { text: string; marks: TextMark[]; caret: number } | null {
  if (offset <= 0 || text[offset - 1] !== '\t') return null;
  const next = text.slice(0, offset - 1) + text.slice(offset);
  const nextMarks = marks
    .map(m => {
      let { start, end } = m;
      if (start >= offset) start -= 1;
      else if (start >= offset - 1) start = offset - 1;
      if (end >= offset) end -= 1;
      else if (end > offset - 1) end = offset - 1;
      return { ...m, start, end };
    })
    .filter(m => m.start < m.end);
  return {
    text: next,
    marks: nextMarks,
    caret: offset - 1,
  };
}
