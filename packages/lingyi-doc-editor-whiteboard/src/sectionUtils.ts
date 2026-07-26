import type { SectionElement, WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { getSectionAspectRatio, isFixedSectionAspect } from '@lingyi-doc/core-whiteboard';
import type { SectionAspect } from '@lingyi-doc/core-whiteboard';
import { elementBounds, rectsIntersect } from './viewportUtils';

export { isFixedSectionAspect, getSectionAspectRatio };

/** 与分区框相交的画布元素（不含分区自身、其他分区、连线/画笔） */
export function findElementsInSection(
  section: SectionElement,
  elements: WhiteboardElement[],
): WhiteboardElement[] {
  const sectionBox = elementBounds(section);
  return elements.filter(el => {
    if (el.id === section.id) return false;
    if (el.type === 'section') return false;
    if (el.type === 'connector' || el.type === 'pen') return false;
    return rectsIntersect(elementBounds(el), sectionBox);
  });
}

export function expandIdsWithSectionContents(
  ids: string[],
  elements: WhiteboardElement[],
): string[] {
  const expanded = new Set(ids);
  for (const id of ids) {
    const sec = elements.find(e => e.id === id);
    if (!sec || sec.type !== 'section') continue;
    for (const child of findElementsInSection(sec, elements)) {
      expanded.add(child.id);
    }
  }
  return [...expanded];
}

/** 保证与分区相交的图形层级始终高于该分区 */
export function ensureElementsAboveSections(elements: WhiteboardElement[]): WhiteboardElement[] {
  const sections = elements.filter((e): e is SectionElement => e.type === 'section');
  if (!sections.length) return elements;

  let changed = false;
  const next = elements.map(el => {
    if (el.type === 'section' || el.type === 'connector' || el.type === 'pen') return el;

    const box = elementBounds(el);
    let minZ = el.zIndex;
    for (const sec of sections) {
      if (rectsIntersect(box, elementBounds(sec))) {
        minZ = Math.max(minZ, sec.zIndex + 1);
      }
    }
    if (minZ > el.zIndex) {
      changed = true;
      return { ...el, zIndex: minZ };
    }
    return el;
  });

  return changed ? next : elements;
}

export function constrainRectToAspectRatio(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  ratio: number,
  minSize = 40,
): { x: number; y: number; w: number; h: number } {
  const right = end.x >= start.x;
  const down = end.y >= start.y;
  let w = Math.max(Math.abs(end.x - start.x), minSize);
  let h = Math.max(Math.abs(end.y - start.y), minSize);

  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;

  w = Math.max(w, minSize);
  h = Math.max(h, minSize);
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;

  const x = right ? start.x : start.x - w;
  const y = down ? start.y : start.y - h;
  return { x, y, w, h };
}

export function sectionCreateLockAspect(aspect: SectionAspect, shiftKey: boolean): boolean {
  return isFixedSectionAspect(aspect) || shiftKey;
}

export function sectionResizeLockAspect(
  aspect: SectionAspect,
  shiftKey: boolean,
): boolean {
  return isFixedSectionAspect(aspect) || shiftKey;
}
