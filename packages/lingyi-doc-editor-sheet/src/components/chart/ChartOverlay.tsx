import React, { useCallback, useState, useRef, useEffect } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { ChartInstance } from '@lingyi-doc/core-types';
import { useSheetStore } from '../../store/sheetStore';
import { ChartRenderer } from './ChartRenderer';

interface ChartOverlayProps {
  table: FreeTable;
  scrollLeft: number;
  scrollTop: number;
  zoomLevel: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedChartId: string | null;
  onSelectChart: (chartId: string | null) => void;
}

export const ChartOverlay: React.FC<ChartOverlayProps> = ({
  table,
  scrollLeft,
  scrollTop,
  zoomLevel,
  containerRef,
  selectedChartId,
  onSelectChart,
}) => {
  const [charts, setCharts] = useState<ChartInstance[]>(table.getAllCharts());
  const [dataVersion, setDataVersion] = useState(0);
  const [dragging, setDragging] = useState<{ chartId: string; startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ chartId: string; startX: number; startY: number; origW: number; origH: number } | null>(null);
  const dragRef = useRef(dragging);
  dragRef.current = dragging;
  const resizeRef = useRef(resizing);
  resizeRef.current = resizing;

  // Subscribe to table changes — increment version to force chart re-parse
  useEffect(() => {
    const unsub = table.onChange(() => {
      setCharts(table.getAllCharts());
      setDataVersion(v => v + 1);
    });
    return unsub;
  }, [table]);

  const sheet = table.sheet;

  const handleDragStart = useCallback((chartId: string, e: React.MouseEvent) => {
    setDragging({
      chartId,
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: table.getChart(chartId)?.position.offsetX || 0,
      origOffsetY: table.getChart(chartId)?.position.offsetY || 0,
    });
    e.preventDefault();
  }, [table]);

  const handleResizeStart = useCallback((chartId: string, e: React.MouseEvent) => {
    const chart = table.getChart(chartId);
    if (!chart) return;
    setResizing({
      chartId,
      startX: e.clientX,
      startY: e.clientY,
      origW: chart.position.width,
      origH: chart.position.height,
    });
    e.preventDefault();
  }, [table]);

  // Global mouse move/up for drag and resize
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d) {
        const dx = (e.clientX - d.startX) / zoomLevel;
        const dy = (e.clientY - d.startY) / zoomLevel;
        table.updateChart(d.chartId, {
          position: {
            ...table.getChart(d.chartId)!.position,
            offsetX: d.origOffsetX + dx,
            offsetY: d.origOffsetY + dy,
          },
        });
        return;
      }

      const r = resizeRef.current;
      if (r) {
        const dx = (e.clientX - r.startX) / zoomLevel;
        const dy = (e.clientY - r.startY) / zoomLevel;
        table.updateChart(r.chartId, {
          position: {
            ...table.getChart(r.chartId)!.position,
            width: Math.max(100, r.origW + dx),
            height: Math.max(80, r.origH + dy),
          },
        });
      }
    };

    const handleUp = () => {
      setDragging(null);
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [zoomLevel, table]);

  // Delete selected chart on Delete key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedChartId) {
        if (useSheetStore.getState().editingCell) return;
        table.removeChart(selectedChartId);
        onSelectChart(null);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedChartId, table]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {charts.map(chart => (
        <div key={chart.id} style={{ pointerEvents: 'auto' }}>
          <ChartRenderer
            chart={chart}
            table={table}
            columnWidths={sheet.columnWidths}
            rowHeights={sheet.rowHeights}
            scrollLeft={scrollLeft}
            scrollTop={scrollTop}
            zoomLevel={zoomLevel}
            dataVersion={dataVersion}
            onDragStart={handleDragStart}
            onResizeStart={handleResizeStart}
            onSelect={onSelectChart}
            isSelected={selectedChartId === chart.id}
          />
        </div>
      ))}
    </div>
  );
};
