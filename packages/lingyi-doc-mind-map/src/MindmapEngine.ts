import type { MindMapLayout, MindNode, MindNoteBranchStyle, MindNoteStructure } from '@lingyi-doc/core-mindmap';
import { getMindmapNodeImageScreenLayoutRect, getMindmapNodeRect, hitMindmapNode } from './hitTest';
import { measureMindmapElementSize } from './measureBounds';
import { computeMindmapLayout, paintMindmap, paintMindmapBackground } from './renderer/paintMindmap';
import type {
  MindmapContentBounds,
  MindmapHitResult,
  MindmapPaintOptions,
  MindmapRenderOptions,
  MindmapThemeId,
  MindmapViewport,
} from './types';
import { MINDMAP_CONTENT_PADDING } from './types';

export interface MindmapEngineOptions {
  mode: 'standalone' | 'embedded';
  root: MindNode;
  structure: MindNoteStructure;
  branchStyle?: MindNoteBranchStyle;
  themeId?: MindmapThemeId;
  contentPadding?: number;
}

export class MindmapEngine {
  private root: MindNode;
  private structure: MindNoteStructure;
  private branchStyle: MindNoteBranchStyle;
  private themeId: MindmapThemeId;
  private contentPadding: number;
  readonly mode: 'standalone' | 'embedded';
  private layoutCache: MindMapLayout | null = null;
  private viewport: MindmapViewport = { x: 0, y: 0, zoom: 1 };

  constructor(options: MindmapEngineOptions) {
    this.mode = options.mode;
    this.root = options.root;
    this.structure = options.structure;
    this.branchStyle = options.branchStyle ?? 'straight';
    this.themeId = options.themeId ?? (options.mode === 'embedded' ? 'whiteboard' : 'default');
    this.contentPadding = options.contentPadding ?? (options.mode === 'embedded' ? MINDMAP_CONTENT_PADDING : 48);
  }

  setRoot(root: MindNode): void {
    this.root = root;
    this.layoutCache = null;
  }

  getRoot(): MindNode {
    return this.root;
  }

  setStructure(structure: MindNoteStructure): void {
    this.structure = structure;
    this.layoutCache = null;
  }

  setBranchStyle(branchStyle: MindNoteBranchStyle): void {
    this.branchStyle = branchStyle;
    this.layoutCache = null;
  }

  setThemeId(themeId: MindmapThemeId): void {
    this.themeId = themeId;
  }

  setViewport(viewport: Partial<MindmapViewport>): void {
    this.viewport = { ...this.viewport, ...viewport };
  }

  getViewport(): MindmapViewport {
    return this.viewport;
  }

  layout(force = false): MindMapLayout {
    if (!force && this.layoutCache) return this.layoutCache;
    this.layoutCache = computeMindmapLayout(this.root, this.structure, this.branchStyle, this.themeId);
    return this.layoutCache;
  }

  getRenderOptions(): MindmapRenderOptions {
    return {
      structure: this.structure,
      branchStyle: this.branchStyle,
      themeId: this.themeId,
      contentPadding: this.contentPadding,
    };
  }

  measureElementSize(): MindmapContentBounds {
    return measureMindmapElementSize(
      this.root,
      this.structure,
      this.branchStyle,
      this.mode === 'embedded' ? this.contentPadding : 0,
      this.themeId,
    );
  }

  hitTest(localX: number, localY: number): MindmapHitResult {
    return hitMindmapNode(
      this.root,
      this.structure,
      this.branchStyle,
      localX,
      localY,
      this.contentPadding,
      this.layout(),
      this.themeId,
    );
  }

  getNodeRect(nodeId: string): { x: number; y: number; width: number; height: number } | null {
    return getMindmapNodeRect(
      this.root,
      this.structure,
      this.branchStyle,
      nodeId,
      this.contentPadding,
      this.layout(),
      this.themeId,
    );
  }

  getNodeImageRect(nodeId: string): { x: number; y: number; width: number; height: number } | null {
    return getMindmapNodeImageScreenLayoutRect(
      this.root,
      this.structure,
      this.branchStyle,
      nodeId,
      this.contentPadding,
      this.layout(),
      this.themeId,
    );
  }

  paintStandalone(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    paintOpts: MindmapPaintOptions = {},
  ): void {
    paintMindmapBackground(ctx, width, height, this.themeId);
    ctx.save();
    ctx.translate(this.viewport.x, this.viewport.y);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);
    paintMindmap(ctx, {
      root: this.root,
      options: { ...this.getRenderOptions(), contentPadding: this.contentPadding },
      layout: this.layout(),
    }, paintOpts);
    ctx.restore();
  }

  paintEmbedded(ctx: CanvasRenderingContext2D, paintOpts: MindmapPaintOptions = {}): MindMapLayout {
    return paintMindmap(ctx, {
      root: this.root,
      options: this.getRenderOptions(),
      layout: this.layout(),
    }, paintOpts);
  }

  fitView(canvasWidth: number, canvasHeight: number, padding = 48): void {
    const map = this.layout();
    const contentW = map.width + this.contentPadding * 2;
    const contentH = map.height + this.contentPadding * 2;
    const scaleX = (canvasWidth - padding * 2) / Math.max(contentW, 1);
    const scaleY = (canvasHeight - padding * 2) / Math.max(contentH, 1);
    const zoom = Math.min(scaleX, scaleY, 2);
    this.viewport = {
      zoom,
      x: (canvasWidth - contentW * zoom) / 2,
      y: (canvasHeight - contentH * zoom) / 2,
    };
  }
}
