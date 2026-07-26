import type { MindNoteStructure } from '@lingyi-doc/core-mindmap';
import type { MindNode, MindNoteBranchStyle } from '@lingyi-doc/core-types';
import { printHtmlDocument, wrapImagePrintHtml } from '@lingyi-doc/core-types';
import {
  MindmapEngine,
  collectMindmapImageSrcs,
  paintMindmap,
  paintMindmapBackground,
  preloadMindmapImages,
} from '@lingyi-doc/mind-map';

const MAX_PRINT_EDGE_PX = 8192;
const PRINT_PADDING = 48;

function preloadMindmapImagesAsync(root: MindNode): Promise<void> {
  return new Promise(resolve => {
    preloadMindmapImages(collectMindmapImageSrcs(root), resolve);
  });
}

/** 将思维导图视图渲染为图片并打开打印对话框 */
export async function printMindNoteMap(
  root: MindNode,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  title: string,
): Promise<void> {
  await preloadMindmapImagesAsync(root);

  const engine = new MindmapEngine({
    mode: 'standalone',
    root,
    structure,
    branchStyle,
    themeId: 'print',
    contentPadding: PRINT_PADDING,
  });
  const layout = engine.layout(true);
  const contentW = layout.width + PRINT_PADDING * 2;
  const contentH = layout.height + PRINT_PADDING * 2;
  const scale = Math.min(1, MAX_PRINT_EDGE_PX / Math.max(contentW, contentH, 1));
  const canvasW = Math.max(1, Math.ceil(contentW * scale));
  const canvasH = Math.max(1, Math.ceil(contentH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  paintMindmapBackground(ctx, canvasW, canvasH, 'print');
  ctx.save();
  ctx.scale(scale, scale);
  paintMindmap(ctx, {
    root,
    options: {
      structure,
      branchStyle,
      themeId: 'print',
      contentPadding: PRINT_PADDING,
    },
    layout,
  });
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  await printHtmlDocument(wrapImagePrintHtml(title, dataUrl));
}
