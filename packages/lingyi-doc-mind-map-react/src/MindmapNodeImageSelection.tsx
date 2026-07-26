import React from 'react';

const ACCENT = '#3370ff';
const HANDLE = 10;
const OFFSET = -HANDLE / 2;

export type MindmapImageResizeHandle =
  | 'nw' | 'n' | 'ne'
  | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: { id: MindmapImageResizeHandle; style: React.CSSProperties }[] = [
  { id: 'nw', style: { left: OFFSET, top: OFFSET, cursor: 'nwse-resize' } },
  { id: 'n', style: { left: '50%', top: OFFSET, marginLeft: OFFSET, cursor: 'ns-resize' } },
  { id: 'ne', style: { right: OFFSET, top: OFFSET, cursor: 'nesw-resize' } },
  { id: 'e', style: { right: OFFSET, top: '50%', marginTop: OFFSET, cursor: 'ew-resize' } },
  { id: 'se', style: { right: OFFSET, bottom: OFFSET, cursor: 'nwse-resize' } },
  { id: 's', style: { left: '50%', bottom: OFFSET, marginLeft: OFFSET, cursor: 'ns-resize' } },
  { id: 'sw', style: { left: OFFSET, bottom: OFFSET, cursor: 'nesw-resize' } },
  { id: 'w', style: { left: OFFSET, top: '50%', marginTop: OFFSET, cursor: 'ew-resize' } },
];

export interface MindmapNodeImageSelectionProps {
  rect: { left: number; top: number; width: number; height: number };
  accent?: string;
  readOnly?: boolean;
  onResizeStart?: (handle: MindmapImageResizeHandle, e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const MindmapNodeImageSelection: React.FC<MindmapNodeImageSelectionProps> = ({
  rect,
  accent = ACCENT,
  readOnly,
  onResizeStart,
  onContextMenu,
}) => {
  return (
    <div
      data-mindmap-image-selection
      onContextMenu={onContextMenu}
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        border: `1.5px solid ${accent}`,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 10040,
      }}
    >
      {!readOnly && onResizeStart && HANDLES.map(h => (
        <div
          key={h.id}
          onPointerDown={e => {
            e.stopPropagation();
            e.preventDefault();
            onResizeStart(h.id, e);
          }}
          style={{
            position: 'absolute',
            width: HANDLE,
            height: HANDLE,
            borderRadius: 2,
            background: '#fff',
            border: `1.5px solid ${accent}`,
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            ...h.style,
          }}
        />
      ))}
    </div>
  );
};
