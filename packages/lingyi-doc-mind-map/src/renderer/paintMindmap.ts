import {
  computeMindMapLayout,
  findMindNode,
  getMindNodePadHorizontal,
  getMindNodePadVertical,
  type MindMapLayout,
  type MindMapLayoutNode,
  type MindNode,
  type MindNoteBranchStyle,
  type MindNoteStructure,
} from '@lingyi-doc/core-mindmap';
import { resolveTheme } from '../theme/presets';
import { computeThemedMindMapLayout } from '../themeMeasure';
import type { MindmapPaintOptions, MindmapRenderOptions, MindmapTheme, MindmapThemeId } from '../types';
import { drawCollapseButton } from './collapseButton';
import { getCachedMindmapImage } from './imageCache';
import { getMindmapNodeImageRect } from './nodeImage';
import { resolveNodeAppearance } from './nodeAppearance';
import { drawNodeShape, drawAlignedNodeText, drawLineThrough } from './drawShapes';

export interface PaintMindmapContext {
  root: MindNode;
  options: MindmapRenderOptions;
  layout?: MindMapLayout;
}

function getTheme(options: MindmapRenderOptions): MindmapTheme {
  return resolveTheme(options.themeId ?? 'default', options.theme);
}

export function computeMindmapLayout(
  root: MindNode,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  themeId?: MindmapThemeId,
): MindMapLayout {
  if (themeId) {
    return computeThemedMindMapLayout(root, structure, branchStyle, themeId);
  }
  return computeMindMapLayout(root, structure, branchStyle);
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawNodeImage(
  ctx: CanvasRenderingContext2D,
  node: MindNode,
  ln: MindMapLayoutNode,
  textBottomY: number,
): void {
  if (!node.image) return;
  const img = getCachedMindmapImage(node.image);
  if (!img) return;

  const rect = getMindmapNodeImageRect(node, ln, textBottomY);
  if (!rect) return;
  const { x: imgX, y: imgY, width: imgW, height: imgH } = rect;
  const flipH = !!node.imageFlipH;
  const flipV = !!node.imageFlipV;

  ctx.save();
  ctx.beginPath();
  drawNodeShape(ctx, 'rect', imgX, imgY, imgW, imgH, 4);
  ctx.clip();
  if (flipH || flipV) {
    const cx = imgX + imgW / 2;
    const cy = imgY + imgH / 2;
    ctx.translate(cx, cy);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
  } else {
    ctx.drawImage(img, imgX, imgY, imgW, imgH);
  }
  ctx.restore();
}

export function paintMindmap(
  ctx: CanvasRenderingContext2D,
  input: PaintMindmapContext,
  paintOpts: MindmapPaintOptions = {},
): MindMapLayout {
  const { root, options } = input;
  const theme = getTheme(options);
  const branchStyle = options.branchStyle ?? 'straight';
  const layout = input.layout ?? computeMindmapLayout(root, options.structure, branchStyle, options.themeId);
  const padding = options.contentPadding ?? 0;
  const lineColor = theme.lineColor;

  ctx.save();
  ctx.translate(padding, padding);

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = theme.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of layout.paths) {
    ctx.stroke(new Path2D(path.d));
  }

  for (const ln of layout.nodes) {
    const found = findMindNode(root, ln.id)?.node;
    if (!found) continue;
    const appearance = resolveNodeAppearance(found, ln, theme);
    const hideText = paintOpts.hideNodeTextId === ln.id;

    if (appearance.showBox && appearance.fillColor && !hideText) {
      const fillAlpha = Math.max(0, Math.min(1, (found.fillOpacity ?? 100) / 100));
      const borderAlpha = Math.max(0, Math.min(1, (found.borderOpacity ?? 100) / 100));
      ctx.fillStyle = appearance.fillColor;
      ctx.strokeStyle = appearance.borderColor || theme.accent;
      ctx.lineWidth = 1.5;
      drawNodeShape(ctx, appearance.shapeKind, ln.x, ln.y, ln.width, ln.height, 8);
      ctx.globalAlpha = fillAlpha;
      ctx.fill();
      if (appearance.borderColor) {
        ctx.globalAlpha = borderAlpha;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (!hideText) {
      ctx.fillStyle = appearance.textColor;
      ctx.font = `${appearance.fontWeight} ${appearance.fontSize}px ${theme.fontFamily}`;
      const textAlign = found.textAlign ?? (appearance.showBox ? 'center' : 'left');
      const textVerticalAlign = found.textVerticalAlign ?? 'center';
      ctx.textAlign = textAlign;
      const text = found.text || '输入文本';
      const lineHeight = Math.round(appearance.fontSize * 1.43);
      const padTop = getMindNodePadVertical(ln.depth);
      const padBottom = getMindNodePadVertical(ln.depth);
      const padLeft = appearance.showBox ? getMindNodePadHorizontal(ln.depth) : 0;
      const padRight = appearance.showBox ? getMindNodePadHorizontal(ln.depth) : 0;
      const contentW = Math.max(1, ln.width - padLeft - padRight);

      if (found.image) {
        const lines = wrapTextLines(ctx, text, contentW);
        const textBlockH = lines.length * lineHeight;
        let textY = ln.y + padTop + lineHeight / 2;
        for (const line of lines) {
          let tx = ln.x + padLeft;
          if (textAlign === 'center') tx = ln.x + ln.width / 2;
          else if (textAlign === 'right') tx = ln.x + ln.width - padRight;
          ctx.fillText(line, tx, textY, contentW);
          if (appearance.lineThrough) {
            drawLineThrough(ctx, line, tx, textY, textAlign, contentW);
          }
          textY += lineHeight;
        }
        drawNodeImage(ctx, found, ln, ln.y + padTop + textBlockH);
      } else {
        drawAlignedNodeText(ctx, text, ln, {
          lineHeight,
          padTop,
          padBottom,
          padLeft,
          padRight,
          textAlign,
          textVerticalAlign,
          lineThrough: appearance.lineThrough,
        });
      }
    }

    if (paintOpts.activeNodeId === ln.id && !hideText) {
      ctx.save();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      const pad = appearance.showBox ? 1.5 : 4;
      if (appearance.showBox) {
        drawNodeShape(
          ctx,
          appearance.shapeKind,
          ln.x - pad,
          ln.y - pad,
          ln.width + pad * 2,
          ln.height + pad * 2,
          10,
        );
      } else {
        ctx.strokeRect(ln.x - pad, ln.y - pad, ln.width + pad * 2, ln.height + pad * 2);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (ln.childCount) {
      drawCollapseButton(
        ctx,
        ln,
        options.structure,
        theme.accent,
        paintOpts.hoveredCollapseNodeId === ln.id,
      );
    }
  }

  ctx.restore();
  return layout;
}

export function paintMindmapBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  themeId: MindmapRenderOptions['themeId'] = 'default',
): void {
  const theme = resolveTheme(themeId);
  if (!theme.canvasBg || theme.canvasBg === 'transparent') return;
  ctx.fillStyle = theme.canvasBg;
  ctx.fillRect(0, 0, width, height);
}
