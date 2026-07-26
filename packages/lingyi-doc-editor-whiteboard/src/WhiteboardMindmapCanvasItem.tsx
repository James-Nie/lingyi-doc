import React from 'react';
import type { MindmapElement } from '@lingyi-doc/core-whiteboard';
import { WhiteboardMindmapView, type WhiteboardMindmapEditProps } from './WhiteboardMindmapView';

/** 画板内思维导图：直接锚定在画布坐标，无独立容器框 */
interface WhiteboardMindmapCanvasItemProps {
  element: MindmapElement;
  selected: boolean;
  hovered?: boolean;
  readOnly?: boolean;
  selectMode?: boolean;
  editing?: boolean;
  edit?: WhiteboardMindmapEditProps;
  onPointerDown?: (e: React.PointerEvent) => void;
  onEnterEdit?: () => void;
}

export const WhiteboardMindmapCanvasItem: React.FC<WhiteboardMindmapCanvasItemProps> = ({
  element,
  selected,
  hovered = false,
  readOnly,
  selectMode = false,
  editing = false,
  edit,
  onPointerDown,
  onEnterEdit,
}) => {
  const interactive = selected && editing && selectMode && !readOnly;

  return (
    <div
      data-wb-mindmap={element.id}
      onPointerDown={interactive ? undefined : onPointerDown}
      onDoubleClick={e => {
        if (readOnly || !selectMode || !selected) return;
        e.stopPropagation();
        onEnterEdit?.();
      }}
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        zIndex: element.zIndex,
        overflow: 'visible',
        pointerEvents: interactive ? 'none' : 'auto',
        cursor: readOnly ? 'default' : selectMode ? 'move' : 'default',
        ...(hovered && !selected && !interactive
          ? { filter: 'drop-shadow(0 0 0 2px rgba(51,112,255,0.35))' }
          : undefined),
      }}
    >
      <div
        style={{
          overflow: 'visible',
          pointerEvents: interactive ? 'auto' : 'none',
          minWidth: element.width,
          minHeight: element.height,
        }}
        onPointerDown={interactive ? e => e.stopPropagation() : undefined}
      >
        <WhiteboardMindmapView
          element={element}
          readOnly={readOnly}
          selectMode={selectMode}
          editing={editing}
          edit={edit}
          canvasEmbedded
        />
      </div>
    </div>
  );
};
