import React, { useEffect, useRef } from 'react';
import { ChartEngine, ChartParser } from '@lingyi-doc/core';
import type { ChartInstance, ChartData } from '@lingyi-doc/core';
import type { FreeTable } from '@lingyi-doc/core';

interface ChartRendererProps {
  chart: ChartInstance;
  table: FreeTable;
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  scrollLeft: number;
  scrollTop: number;
  zoomLevel: number;
  dataVersion: number;
  onDragStart?: (chartId: string, e: React.MouseEvent) => void;
  onResizeStart?: (chartId: string, e: React.MouseEvent) => void;
  onSelect?: (chartId: string) => void;
  isSelected?: boolean;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  chart,
  table,
  columnWidths,
  rowHeights,
  scrollLeft,
  scrollTop,
  zoomLevel,
  dataVersion,
  onDragStart,
  onResizeStart,
  onSelect,
  isSelected,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);

  // Parse chart data
  const chartData: ChartData = React.useMemo(() => {
    try {
      return ChartParser.parse(table, chart.dataSource);
    } catch {
      return { categories: [], series: [] };
    }
  }, [table, chart.dataSource, dataVersion]);

  // Calculate pixel position
  const { x, y } = React.useMemo(() => {
    const headerW = 46;
    const headerH = 25;
    let px = headerW + chart.position.offsetX;
    let py = headerH + chart.position.offsetY;

    // Calculate position based on anchor cell
    for (let c = 0; c < chart.position.anchorCol; c++) {
      px += columnWidths.get(c) || 100;
    }
    for (let r = 0; r < chart.position.anchorRow; r++) {
      py += rowHeights.get(r) || 25;
    }

    px -= scrollLeft;
    py -= scrollTop;
    px *= zoomLevel;
    py *= zoomLevel;

    return { x: px, y: py };
  }, [chart.position, columnWidths, rowHeights, scrollLeft, scrollTop, zoomLevel]);

  const width = chart.position.width * zoomLevel;
  const height = chart.position.height * zoomLevel;

  // Render chart
  useEffect(() => {
    if (!svgRef.current) return;
    if (!engineRef.current) engineRef.current = new ChartEngine();

    engineRef.current.render(svgRef.current, chartData, chart.config, chart.position.width, chart.position.height);
  }, [chartData, chart.config, chart.position.width, chart.position.height]);

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        // First, select the chart
        onSelect?.(chart.id);
        // Check if clicking on resize handle (bottom-right corner)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const isResize = e.clientX > rect.right - 15 && e.clientY > rect.bottom - 15;
        if (isResize) {
          e.stopPropagation();
          onResizeStart?.(chart.id, e);
        } else {
          onDragStart?.(chart.id, e);
        }
      }}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        background: '#fff',
        borderRadius: 8,
        boxShadow: isSelected
          ? '0 0 0 2px #4285F4, 0 4px 16px rgba(0,0,0,0.15)'
          : '0 2px 8px rgba(0,0,0,0.1)',
        cursor: 'move',
        zIndex: isSelected ? 1000 : 100,
        overflow: 'hidden',
        border: '1px solid #e0e0e0',
        userSelect: 'none',
      }}
    >
      <svg
        ref={svgRef}
        width={chart.position.width}
        height={chart.position.height}
        viewBox={`0 0 ${chart.position.width} ${chart.position.height}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {/* Resize handle */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 14,
          height: 14,
          cursor: 'nwse-resize',
          background: isSelected ? '#4285F4' : 'transparent',
          borderRadius: '0 0 7px 0',
        }}
      />
    </div>
  );
};
