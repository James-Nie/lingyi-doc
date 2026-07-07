import type { MindNode, MindmapLayout, MindNoteBranchStyle } from '@lingyi-doc/core';
import { computeMindMapLayout } from '@lingyi-doc/core';

const MIN_W = 160;
const MIN_H = 120;
export const SMM_EMBED_PADDING = 64;
const PADDING = SMM_EMBED_PADDING;

export interface MindmapBoundsUpdate {
  width: number;
  height: number;
}

export interface AlignSmmResult extends MindmapBoundsUpdate {
  /** draw.rbox() 可用且视图已平移到 padding 内 */
  aligned: boolean;
}

export function computeMindmapElementSize(
  root: MindNode,
  layout: MindmapLayout,
  branchStyle: MindNoteBranchStyle = 'straight',
): { width: number; height: number } {
  const result = computeMindMapLayout(root, layout, branchStyle);
  return sizeFromContent(result.width, result.height) ?? { width: MIN_W, height: MIN_H };
}

interface SmmDrawLike {
  draw?: { rbox?: () => { x: number; y: number; width: number; height: number } };
}

interface SmmViewLike {
  reset?: () => void;
  setScale?: (scale: number) => void;
  translateXY?: (x: number, y: number) => void;
}

/** 嵌入画板：重置 SMM 视图变换，避免 translateXY 累积漂移 */
export function resetSmmEmbeddedView(mm: { view?: SmmViewLike }): void {
  try {
    mm.view?.reset?.();
  } catch {
    // ignore
  }
  try {
    mm.view?.setScale?.(1);
  } catch {
    // ignore
  }
}

function sizeFromContent(contentW: number, contentH: number): { width: number; height: number } | null {
  if (!Number.isFinite(contentW) || !Number.isFinite(contentH)) return null;
  if (contentW < 8 || contentH < 8) return null;
  return {
    width: Math.max(Math.ceil(contentW + PADDING * 2), MIN_W),
    height: Math.max(Math.ceil(contentH + PADDING * 2), MIN_H),
  };
}

type RectBox = { x: number; y: number; width: number; height: number };

function isValidRect(rect: RectBox | null | undefined): rect is RectBox {
  if (!rect) return false;
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return false;
  return rect.width >= 8 && rect.height >= 8;
}

function safeDrawRbox(mm: SmmDrawLike): RectBox | null {
  try {
    const rect = mm.draw?.rbox?.();
    return isValidRect(rect) ? rect : null;
  } catch {
    return null;
  }
}

function readSvgContentBBox(container?: HTMLElement | null): RectBox | null {
  if (!container) return null;
  const svg = container.querySelector('svg') as SVGSVGElement | null;
  if (!svg) return null;
  try {
    const bbox = svg.getBBox();
    const rect = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    return isValidRect(rect) ? rect : null;
  } catch {
    return null;
  }
}

export interface AlignSmmOptions {
  /** 是否重置 SMM 视图变换；日常同步应设为 false，避免内容漂移或被裁切 */
  resetView?: boolean;
}

/** 画板嵌入：锁定 scale=1，平移 SMM 视图使内容落在 padding 内，返回容器尺寸 */
export function alignSmmEmbeddedView(
  mm: SmmDrawLike & { view?: SmmViewLike },
  padding = PADDING,
  container?: HTMLElement | null,
  options?: AlignSmmOptions,
): AlignSmmResult | null {
  if (options?.resetView !== false) {
    resetSmmEmbeddedView(mm);
  }

  const rbox = safeDrawRbox(mm);

  if (rbox) {
    const dx = padding - rbox.x;
    const dy = padding - rbox.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      try {
        mm.view?.translateXY?.(dx, dy);
      } catch {
        // 平移失败时仍尝试返回尺寸
      }
    }

    const after = safeDrawRbox(mm) ?? { ...rbox, x: padding, y: padding };
    const size = sizeFromContent(after.width, after.height);
    if (!size) return null;
    return { ...size, aligned: true };
  }

  // rbox 尚不可用：仅用 SVG 估算尺寸，不做平移（getBBox 坐标系与 view 变换不一致会导致漂移）
  const estimate = readSvgContentBBox(container);
  if (estimate) {
    const size = sizeFromContent(estimate.width, estimate.height);
    if (size) return { ...size, aligned: false };
  }

  return null;
}

/** 从 SMM draw.rbox() 或 SVG getBBox 测量内容尺寸 */
export function measureSmmContentBounds(
  container: HTMLElement,
  mm?: SmmDrawLike & { view?: SmmViewLike },
): MindmapBoundsUpdate | null {
  if (mm) {
    const result = alignSmmEmbeddedView(mm, PADDING, container);
    return result ? { width: result.width, height: result.height } : null;
  }

  const rbox = safeDrawRbox(mm ?? {});
  if (rbox) {
    const fromRbox = sizeFromContent(rbox.width, rbox.height);
    if (fromRbox) return fromRbox;
  }

  const fromSvg = readSvgContentBBox(container);
  if (fromSvg) {
    return sizeFromContent(fromSvg.width, fromSvg.height);
  }

  return null;
}
