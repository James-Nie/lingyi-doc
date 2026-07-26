import type { WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { createMindmapElement, createSectionElement, createShapeElement, createStickyElement, createTableElement } from '@lingyi-doc/core-whiteboard';
import type { WhiteboardToolState } from '../WhiteboardToolbar';

export const PLACEMENT_TOOLS = ['shape', 'sticky', 'section', 'table', 'mindmap'] as const;
export type PlacementTool = (typeof PLACEMENT_TOOLS)[number];

export function isPlacementTool(tool: string): tool is PlacementTool {
  return (PLACEMENT_TOOLS as readonly string[]).includes(tool);
}

/** 面板类工具是否已选择具体子项（图形/便签/分区/思维导图） */
export function isToolSubSelectionReady(toolState: WhiteboardToolState): boolean {
  switch (toolState.tool) {
    case 'shape':
      return toolState.shapeKind != null;
    case 'sticky':
      return toolState.stickyColor != null;
    case 'section':
      return toolState.sectionAspect != null;
    case 'mindmap':
      return toolState.mindmapLayout != null;
    default:
      return true;
  }
}

export function isConnectorSubSelectionReady(toolState: WhiteboardToolState): boolean {
  return toolState.connectorStyle != null;
}

export function defaultPlacementSize(toolState: WhiteboardToolState): { w: number; h: number } {
  if (!isToolSubSelectionReady(toolState)) {
    return { w: 0, h: 0 };
  }
  const z = 0;
  switch (toolState.tool) {
    case 'shape': {
      const el = createShapeElement(toolState.shapeKind!, 0, 0, z);
      return { w: el.width, h: el.height };
    }
    case 'sticky': {
      const el = createStickyElement(0, 0, toolState.stickyColor!, z);
      return { w: el.width, h: el.height };
    }
    case 'table': {
      const el = createTableElement(0, 0, z, toolState.tablePreset ?? 'default');
      return { w: el.width, h: el.height };
    }
    case 'section': {
      const el = createSectionElement(toolState.sectionAspect!, 0, 0, z);
      return { w: el.width, h: el.height };
    }
    case 'mindmap': {
      const el = createMindmapElement(toolState.mindmapLayout!, 0, 0, z);
      return { w: el.width, h: el.height };
    }
    default:
      return { w: 0, h: 0 };
  }
}

export function computePlacementPreviewRect(
  toolState: WhiteboardToolState,
  pt: WhiteboardPoint,
): { x: number; y: number; w: number; h: number } {
  const { w, h } = defaultPlacementSize(toolState);
  return { x: pt.x - w / 2, y: pt.y - h / 2, w, h };
}

export function buildPlacementPreviewElement(
  toolState: WhiteboardToolState,
  rect: { x: number; y: number; w: number; h: number },
): WhiteboardElement | null {
  if (!isToolSubSelectionReady(toolState)) return null;
  const z = 0;
  switch (toolState.tool) {
    case 'shape': {
      const el = createShapeElement(toolState.shapeKind!, rect.x, rect.y, z);
      return { ...el, width: rect.w, height: rect.h };
    }
    case 'sticky':
      return createStickyElement(rect.x, rect.y, toolState.stickyColor!, z);
    case 'table':
      return createTableElement(rect.x, rect.y, z, toolState.tablePreset ?? 'default');
    case 'section': {
      const el = createSectionElement(toolState.sectionAspect!, rect.x, rect.y, z);
      return { ...el, width: rect.w, height: rect.h };
    }
    case 'mindmap':
      return createMindmapElement(toolState.mindmapLayout!, rect.x, rect.y, z);
    default:
      return null;
  }
}
