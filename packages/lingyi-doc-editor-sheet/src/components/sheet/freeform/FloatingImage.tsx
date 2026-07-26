import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FreeTable, ViewportManager } from '@lingyi-doc/core-sheet';
import type { FloatingImage } from '@lingyi-doc/core-types';

interface FloatingImageLayerProps {
  table: FreeTable;
  viewportRef: React.RefObject<ViewportManager>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollLeft: number;
  scrollTop: number;
  zoomLevel: number;
}

export const FloatingImageLayer: React.FC<FloatingImageLayerProps> = ({
  table,
  viewportRef,
  containerRef,
  scrollLeft,
  scrollTop,
  zoomLevel,
}) => {
  const [floatingImages, setFloatingImages] = useState<FloatingImage[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeOffsetRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // 从模型加载浮动图片
  useEffect(() => {
    const images = table.getFloatingImages();
    setFloatingImages(images);

    // 监听表格变更
    const unsubscribe = table.onChange(() => {
      setFloatingImages(table.getFloatingImages());
    });

    return unsubscribe;
  }, [table]);

  // 监听添加浮动图片事件
  useEffect(() => {
    const handleAddFloatingImage = (e: CustomEvent) => {
      const { imageUrl, row, col, sheetId } = e.detail;
      
      // 计算图片初始位置（基于单元格位置）
      const viewport = viewportRef.current;
      if (!viewport) return;

      const cellRect = viewport.getCellRect(
        { row, col },
        table.sheet.columnWidths,
        table.sheet.rowHeights
      );

      if (!cellRect) return;

      table.addFloatingImage({
        imageUrl,
        row,
        col,
        x: cellRect.x + scrollLeft,
        y: cellRect.y + scrollTop,
        width: 200,
        height: 150,
        sheetId,
      });
    };

    document.addEventListener('sheet-add-floating-image', handleAddFloatingImage as EventListener);
    return () => {
      document.removeEventListener('sheet-add-floating-image', handleAddFloatingImage as EventListener);
    };
  }, [table, viewportRef, scrollLeft, scrollTop]);

  const handleMouseDown = useCallback((e: React.MouseEvent, imageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const image = floatingImages.find(img => img.id === imageId);
    if (!image) return;

    setDraggingId(imageId);
    dragOffsetRef.current = {
      x: e.clientX - image.x,
      y: e.clientY - image.y,
    };
  }, [floatingImages]);

  const handleResizeStart = useCallback((e: React.MouseEvent, imageId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const image = floatingImages.find(img => img.id === imageId);
    if (!image) return;

    setResizingId(imageId);
    // 右下角调整：记录当前尺寸与鼠标位置的偏移
    resizeOffsetRef.current = {
      width: image.width - e.clientX,
      height: image.height - e.clientY,
    };
  }, [floatingImages]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingId) {
      table.updateFloatingImage(draggingId, {
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      });
    } else if (resizingId) {
      // 右下角调整：根据鼠标位置计算新尺寸，保持最小尺寸
      const newWidth = Math.max(50, e.clientX + resizeOffsetRef.current.width);
      const newHeight = Math.max(50, e.clientY + resizeOffsetRef.current.height);
      table.updateFloatingImage(resizingId, {
        width: newWidth,
        height: newHeight,
      });
    }
  }, [draggingId, resizingId, table]);

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
    setResizingId(null);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, imageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    table.deleteFloatingImage(imageId);
  }, [table]);

  if (floatingImages.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {floatingImages.map(image => (
        <div
          key={image.id}
          style={{
            position: 'absolute',
            left: image.x,
            top: image.y,
            width: image.width,
            height: image.height,
            cursor: draggingId === image.id ? 'grabbing' : 'grab',
            pointerEvents: 'auto',
            border: '2px solid #4285F4',
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            background: '#fff',
          }}
          onMouseDown={(e) => handleMouseDown(e, image.id)}
        >
          <img
            src={image.imageUrl}
            alt="浮动图片"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
            draggable={false}
          />
          {/* 删除按钮 */}
          <div
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
              zIndex: 10,
            }}
            onClick={(e) => handleDelete(e, image.id)}
          >
            ×
          </div>
          {/* 调整大小手柄 - 右下角 */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 16,
              height: 16,
              cursor: 'nwse-resize',
              background: 'linear-gradient(135deg, transparent 50%, #4285F4 50%)',
              zIndex: 10,
            }}
            onMouseDown={(e) => handleResizeStart(e, image.id)}
          />
        </div>
      ))}
    </div>
  );
};
