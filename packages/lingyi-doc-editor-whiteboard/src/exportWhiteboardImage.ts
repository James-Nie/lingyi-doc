import type { WhiteboardElement } from '@lingyi-doc/core-whiteboard';
import type { MindNode } from '@lingyi-doc/core-types';
import { downloadBlob, sanitizeFileName } from '@lingyi-doc/core-doc';
import { DocumentManager } from '@lingyi-doc/core-client';
import { paintWhiteboard, preloadElementImages } from './canvas/paintWhiteboard';
import type { OverlayState } from './canvas/drawOverlay';
import { elementBounds } from './viewportUtils';

const EXPORT_PADDING = 24;
const MAX_EXPORT_WIDTH = 1200;

const EMPTY_OVERLAY: OverlayState = {
  selectedIds: [],
  marquee: null,
  createPreview: null,
  liveConnector: null,
  livePenPoints: null,
  connectTarget: null,
  connectorEndpoints: null,
  readOnly: true,
};

function computeElementsBounds(elements: WhiteboardElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const b = elementBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

async function resolveAssetSrc(src: string): Promise<string> {
  if (!src || src.startsWith('data:')) return src;
  try {
    return await DocumentManager.fetchAssetAsDataUrl(src);
  } catch {
    return src;
  }
}

async function resolveMindNodeImages(root: MindNode): Promise<MindNode> {
  const image = root.image ? await resolveAssetSrc(root.image) : root.image;
  const children = await Promise.all(root.children.map(resolveMindNodeImages));
  if (image === root.image && children.every((child, index) => child === root.children[index])) {
    return root;
  }
  return { ...root, image, children };
}

/** 将画板内远程图片转为 data URL，供导出内嵌 */
export async function resolveWhiteboardElementsForExport(
  elements: WhiteboardElement[],
): Promise<WhiteboardElement[]> {
  return Promise.all(elements.map(async el => {
    if (el.type === 'image' && el.src) {
      const src = await resolveAssetSrc(el.src);
      return src === el.src ? el : { ...el, src };
    }
    if (el.type === 'mindmap') {
      const root = await resolveMindNodeImages(el.root);
      return root === el.root ? el : { ...el, root };
    }
    return el;
  }));
}

/** 将画板元素渲染为 PNG data URL，供 Word/PDF 导出内嵌 */
export async function renderWhiteboardElementsToDataUrl(
  elements: WhiteboardElement[],
): Promise<string | null> {
  if (!elements.length) return null;

  const bounds = computeElementsBounds(elements);
  if (!bounds) return null;

  await new Promise<void>(resolve => {
    preloadElementImages(elements, resolve);
  });

  const contentW = Math.max(bounds.maxX - bounds.minX, 40);
  const contentH = Math.max(bounds.maxY - bounds.minY, 40);
  const scale = Math.min(1, MAX_EXPORT_WIDTH / (contentW + EXPORT_PADDING * 2));
  const canvasW = Math.ceil((contentW + EXPORT_PADDING * 2) * scale);
  const canvasH = Math.ceil((contentH + EXPORT_PADDING * 2) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const viewport = {
    x: (EXPORT_PADDING - bounds.minX) * scale,
    y: (EXPORT_PADDING - bounds.minY) * scale,
    zoom: scale,
  };

  paintWhiteboard(ctx, canvasW, canvasH, 1, {
    elements,
    viewport,
    overlay: EMPTY_OVERLAY,
  });

  return canvas.toDataURL('image/png');
}

/** 将画板元素渲染为 PNG 并触发浏览器下载 */
export async function downloadWhiteboardElementsAsPng(
  elements: WhiteboardElement[],
  filename: string,
): Promise<void> {
  const resolved = await resolveWhiteboardElementsForExport(elements);
  const dataUrl = await renderWhiteboardElementsToDataUrl(resolved);
  if (!dataUrl) throw new Error('画板为空，无法导出');

  const blob = await fetch(dataUrl).then(res => res.blob());
  const safeName = sanitizeFileName(filename, '画板');
  downloadBlob(blob, `${safeName}.png`);
}
