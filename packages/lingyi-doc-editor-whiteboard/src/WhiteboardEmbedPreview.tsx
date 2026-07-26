import React, { useLayoutEffect, useRef, useState } from 'react';
import type { WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';
import { WhiteboardCanvas, computeFitViewport } from './WhiteboardCanvas';
import { DEFAULT_TOOL_STATE } from './WhiteboardToolbar';
import { WB_COLORS } from './styles';

interface WhiteboardEmbedPreviewProps {
  elements: WhiteboardElement[];
  height?: number;
}

/** 文档内嵌画板预览：只读、自适应缩放展示全部内容 */
export const WhiteboardEmbedPreview: React.FC<WhiteboardEmbedPreviewProps> = ({
  elements,
  height = 400,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<WhiteboardViewport>({ x: 80, y: 80, zoom: 1 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateViewport = () => {
      setViewport(computeFitViewport(elements, el));
    };

    updateViewport();

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateViewport())
      : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [elements, height]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        position: 'relative',
        overflow: 'hidden',
        background: WB_COLORS.canvasBg,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <WhiteboardCanvas
        elements={elements}
        viewport={viewport}
        selectedIds={[]}
        toolState={DEFAULT_TOOL_STATE}
        panMode={false}
        readOnly
        onViewportChange={() => {}}
        onElementsChange={() => {}}
        onSelectionChange={() => {}}
        onElementUpdate={() => {}}
      />
    </div>
  );
};
