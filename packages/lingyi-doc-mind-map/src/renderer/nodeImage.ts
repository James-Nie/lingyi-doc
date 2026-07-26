import {
  findMindNode,
  getMindNodePadHorizontal,
  getMindNodePadVertical,
  getMindNodePadX,
  type MindMapLayoutNode,
  type MindNode,
} from '@lingyi-doc/core-mindmap';
import type { MindmapTheme } from '../types';
import { resolveNodeAppearance } from './nodeAppearance';

export interface MindmapNodeImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function wrapTextLines(
  measureWidth: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (line && measureWidth(test) > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** 与 paint 一致的节点图片布局矩形（布局坐标） */
export function getMindmapNodeImageRect(
  node: MindNode,
  ln: MindMapLayoutNode,
  textBottomY: number,
): MindmapNodeImageRect | null {
  if (!node.image) return null;
  const imgGap = 8;
  const maxContentW = ln.width - getMindNodePadX(ln.depth, true);
  let imgW = node.imageWidth ?? Math.min(maxContentW, 240);
  let imgH = node.imageHeight ?? 120;
  if (imgW > maxContentW) {
    imgH = Math.round(imgH * (maxContentW / imgW));
    imgW = maxContentW;
  }
  return {
    x: ln.x + (ln.width - imgW) / 2,
    y: textBottomY + imgGap,
    width: imgW,
    height: imgH,
  };
}

/** 根据主题与布局精确计算节点图片矩形（供 hitTest / 选中框） */
export function resolveMindmapNodeImageRect(
  root: MindNode,
  ln: MindMapLayoutNode,
  theme: MindmapTheme,
  measureCtx?: CanvasRenderingContext2D | null,
): MindmapNodeImageRect | null {
  const node = findMindNode(root, ln.id)?.node;
  if (!node?.image) return null;

  const appearance = resolveNodeAppearance(node, ln, theme);
  const lineHeight = Math.round(appearance.fontSize * 1.43);
  const padTop = getMindNodePadVertical(ln.depth);
  const padLeft = appearance.showBox ? getMindNodePadHorizontal(ln.depth) : 0;
  const padRight = appearance.showBox ? getMindNodePadHorizontal(ln.depth) : 0;
  const contentW = Math.max(1, ln.width - padLeft - padRight);
  const text = node.text || '输入文本';

  let lineCount = 1;
  if (measureCtx) {
    measureCtx.font = `${appearance.fontWeight} ${appearance.fontSize}px ${theme.fontFamily}`;
    lineCount = wrapTextLines(t => measureCtx.measureText(t).width, text, contentW).length;
  } else if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `${appearance.fontWeight} ${appearance.fontSize}px ${theme.fontFamily}`;
      lineCount = wrapTextLines(t => ctx.measureText(t).width, text, contentW).length;
    } else {
      const avgCharW = appearance.fontSize * 0.55;
      lineCount = Math.max(1, Math.ceil((text.length * avgCharW) / contentW));
    }
  } else {
    const avgCharW = appearance.fontSize * 0.55;
    lineCount = Math.max(1, Math.ceil((text.length * avgCharW) / contentW));
  }

  return getMindmapNodeImageRect(node, ln, ln.y + padTop + lineCount * lineHeight);
}

export function pointInMindmapNodeImageRect(
  x: number,
  y: number,
  rect: MindmapNodeImageRect,
): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
