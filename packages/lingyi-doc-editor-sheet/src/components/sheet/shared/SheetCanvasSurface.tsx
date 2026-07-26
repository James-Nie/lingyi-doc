import React from 'react';
import type { MutableRefObject } from 'react';
import { AxisResizeGuide, type AxisResizeGuideProps } from '../../AxisResizeGuide';

export interface SheetCanvasSurfaceProps {
  canvasContainerRef: MutableRefObject<HTMLDivElement | null>;
  previewMode?: boolean;
  axisResizeGuide?: AxisResizeGuideProps | null;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const SheetCanvasSurface: React.FC<SheetCanvasSurfaceProps> = ({
  canvasContainerRef,
  previewMode = false,
  axisResizeGuide,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onDoubleClick,
  onContextMenu,
}) => (
  <>
    <div
      ref={canvasContainerRef}
      data-sheet-canvas
      tabIndex={previewMode ? undefined : -1}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, outline: 'none' }}
      onMouseDown={previewMode ? undefined : onMouseDown}
      onMouseMove={previewMode ? undefined : onMouseMove}
      onMouseUp={previewMode ? undefined : onMouseUp}
      onMouseLeave={previewMode ? undefined : onMouseLeave}
      onDoubleClick={previewMode ? undefined : onDoubleClick}
      onContextMenu={previewMode ? undefined : onContextMenu}
    />
    {!previewMode && axisResizeGuide && <AxisResizeGuide {...axisResizeGuide} />}
  </>
);
