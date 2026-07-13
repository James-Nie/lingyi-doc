import type { ShapeElement, ShapeKind } from './types';

/** 时序图生命线虚线颜色 */
export const SEQ_LIFELINE_DASH_COLOR = '#666666';

/** 时序图头部默认填充色 */
export const SEQ_LIFELINE_FILL = '#e6e9fe';

/** 时序图默认描边色 */
export const SEQ_LIFELINE_STROKE = '#1f2329';

/** 默认生命线长度（虚线部分） */
export const SEQ_LIFELINE_DEFAULT_LENGTH = 200;

/** 生命线最短长度 */
export const SEQ_LIFELINE_MIN_LENGTH = 40;

const SEQ_LIFELINE_KINDS = new Set<ShapeKind>([
  'seqActor',
  'seqLifeline',
  'seqDbLifeline',
  'seqStorageLifeline',
  'seqBoundaryLifeline',
  'seqControlLifeline',
  'seqEntityLifeline',
  'seqMessage',
]);

export function isSeqLifelineKind(kind: ShapeKind): boolean {
  return SEQ_LIFELINE_KINDS.has(kind);
}

export function resolveSeqLifelineLength(el: Pick<ShapeElement, 'seqLifelineLength'>): number {
  return el.seqLifelineLength ?? SEQ_LIFELINE_DEFAULT_LENGTH;
}

export function getSeqHeadBounds(el: ShapeElement): { x: number; y: number; w: number; h: number } {
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

export function getSeqFullBounds(el: ShapeElement): { x: number; y: number; w: number; h: number } {
  const head = getSeqHeadBounds(el);
  const tail = resolveSeqLifelineLength(el);
  return { ...head, h: head.h + tail };
}

export function getSeqLifelineHandlePoint(el: ShapeElement): { x: number; y: number } {
  const tail = resolveSeqLifelineLength(el);
  return { x: el.x + el.width / 2, y: el.y + el.height + tail };
}
