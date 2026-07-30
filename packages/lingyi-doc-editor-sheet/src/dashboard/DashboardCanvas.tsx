import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Input, message } from 'antd';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import './dashboard-grid.css';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { DashboardModel, DashboardWidget, FilterCondition, DashboardChartDisplayConfig, DashboardMetricCardConfig, DashboardRankListConfig, DashboardGridViewConfig, DashboardProgressConfig } from '@lingyi-doc/core-types';
import { createFilterConditionFromCell } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { WidgetShell } from './components/WidgetShell';
import { DashboardChartWidget } from './components/DashboardChartWidget';
import { MetricCardWidget } from './components/MetricCardWidget';
import { RankListWidget } from './components/RankListWidget';
import { DashboardGridWidget } from './components/DashboardGridWidget';
import { ProgressWidget } from './components/ProgressWidget';
import { useWidgetDataset } from './useWidgetDataset';
import { WidgetConfigSidebar } from './config/WidgetConfigDrawer';

interface DashboardCanvasProps {
  dashboard: DashboardModel;
  table: FreeTable;
  readOnly?: boolean;
  dataVersion: number;
  globalFilters?: FilterCondition[];
  onChange: (dashboard: DashboardModel) => void;
  onGlobalFiltersChange?: (filters: FilterCondition[]) => void;
}

function toLayoutItems(widgets: DashboardWidget[], readOnly?: boolean): Layout[] {
  return widgets.map(w => {
    const minW = 2;
    const minH = 3;
    return {
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: Math.max(w.layout.w, minW),
      h: Math.max(w.layout.h, minH),
      minW,
      minH,
      static: !!readOnly,
    };
  });
}

function layoutsEqual(a: Layout[], b: Layout[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const byId = new Map(b.map(l => [l.i, l]));
  for (const x of a) {
    const y = byId.get(x.i);
    if (!y || x.x !== y.x || x.y !== y.y || x.w !== y.w || x.h !== y.h) {
      return false;
    }
  }
  return true;
}

function layoutItemsCollide(a: Layout, b: Layout): boolean {
  if (a.i === b.i) return false;
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/** 拖动/缩放时的栅格引导：与 RGL 列宽、行高、间距对齐的虚线圆角格 */
const LayoutGuideOverlay: React.FC<{
  width: number;
  cols: number;
  rowHeight: number;
  gap: number;
  rows: number;
}> = ({ width, cols, rowHeight, gap, rows }) => {
  if (width <= 0 || cols <= 0) return null;
  const colWidth = (width - gap * (cols - 1)) / cols;
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      cells.push(
        <div
          key={`${x}-${y}`}
          className="dashboard-layout-guide-cell"
          style={{
            left: x * (colWidth + gap),
            top: y * (rowHeight + gap),
            width: colWidth,
            height: rowHeight,
          }}
        />,
      );
    }
  }
  return (
    <div
      className="dashboard-layout-guide"
      aria-hidden
      style={{
        width,
        height: rows * rowHeight + Math.max(0, rows - 1) * gap,
      }}
    >
      {cells}
    </div>
  );
};

/**
 * 松手后解冲突：固定刚操作的卡片，其余按从上到下、从左到右稳定排序，
 * 仅向下推开重叠项，避免拖动过程中把其他卡片挤到未知位置。
 */
function resolveLayoutOverlaps(layout: Layout[], pinnedId?: string): Layout[] {
  const pinned = pinnedId ? layout.find(l => l.i === pinnedId) : undefined;
  const settled: Layout[] = pinned ? [{ ...pinned }] : [];
  const others = layout
    .filter(l => l.i !== pinnedId)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.i.localeCompare(b.i));

  for (const item of others) {
    let next = { ...item };
    let guard = 0;
    while (guard++ < 500) {
      const hit = settled.find(s => layoutItemsCollide(s, next));
      if (!hit) break;
      next = { ...next, y: hit.y + hit.h };
    }
    settled.push(next);
  }

  const byId = new Map(settled.map(l => [l.i, l]));
  return layout.map(l => byId.get(l.i) || l);
}

const WidgetCell = React.memo(function WidgetCell(props: {
  widget: DashboardWidget;
  table: FreeTable;
  selected: boolean;
  readOnly?: boolean;
  dataVersion: number;
  globalFilters?: FilterCondition[];
  onSelect: () => void;
  onUpdate: (patch: Partial<DashboardWidget>) => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onDataClick: (fieldId: string | undefined, category: string) => void;
}) {
  const {
    widget, table, selected, readOnly, dataVersion, globalFilters,
    onSelect, onUpdate, onCopy, onDelete, onEdit, onDataClick,
  } = props;
  const dataset = useWidgetDataset(table, widget, globalFilters, dataVersion);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(widget.title || '');

  const isMetric = widget.componentType === 'metric.card' || widget.componentType === 'metric.number';
  const isChart = widget.componentType.startsWith('chart.');
  const isGridView = widget.componentType === 'view.grid';
  const isProgress = widget.componentType === 'progress';
  const metricConfig = widget.config as DashboardMetricCardConfig;
  const chartConfig = widget.config as unknown as DashboardChartDisplayConfig;
  const gridConfig = widget.config as unknown as DashboardGridViewConfig;
  const progressConfig = widget.config as unknown as DashboardProgressConfig;
  const shellTitle = widget.title || (widget.config as { title?: string }).title;
  const shellStyle = isMetric
    ? {
        contentBackground: metricConfig.background || '#fff',
        titleColor: metricConfig.titleColor,
        borderColor: metricConfig.borderColor,
        borderWidth: metricConfig.borderWidth,
      }
    : isChart
      ? {
          contentBackground: chartConfig.background || undefined,
          titleColor: chartConfig.titleColor,
          borderColor: chartConfig.borderColor,
          borderWidth: chartConfig.borderWidth,
        }
      : isGridView
        ? {
            contentBackground: gridConfig.background || '#fff',
            titleColor: gridConfig.titleColor,
            borderColor: gridConfig.borderColor,
            borderWidth: gridConfig.borderWidth,
          }
        : isProgress
          ? {
              contentBackground: progressConfig.background || '#fff',
              titleColor: progressConfig.titleColor,
              borderColor: progressConfig.borderColor,
              borderWidth: progressConfig.borderWidth,
            }
          : {};


  const body = (() => {
    const type = widget.componentType;
    if (isMetric) {
      return (
        <MetricCardWidget
          dataset={dataset}
          config={metricConfig}
          readOnly={readOnly}
        />
      );
    }
    if (type === 'rank.list') {
      return (
        <RankListWidget
          dataset={dataset}
          config={widget.config as DashboardRankListConfig}
        />
      );
    }
    if (type === 'text') {
      return (
        <div style={{ padding: 8, color: '#595959', whiteSpace: 'pre-wrap', fontSize: 13 }}>
          {String((widget.config as { content?: string }).content || '')}
        </div>
      );
    }
    if (type === 'view.grid') {
      return (
        <DashboardGridWidget
          table={table}
          config={gridConfig}
          readOnly={readOnly}
          dataVersion={dataVersion}
        />
      );
    }
    if (type === 'progress') {
      return (
        <ProgressWidget
          dataset={dataset}
          config={progressConfig}
        />
      );
    }
    if (type.startsWith('chart.')) {
      const display = widget.config as unknown as DashboardChartDisplayConfig;
      const chartKind = display.chartKind || (type.replace('chart.', '') as DashboardChartDisplayConfig['chartKind']);
      return (
        <DashboardChartWidget
          dataset={dataset}
          display={display}
          chartKind={chartKind}
          onDataClick={(category) => onDataClick(display.categoryFieldId, category)}
        />
      );
    }
    return (
      <div style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        color: '#8c8c8c',
        fontSize: 13,
        padding: 16,
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        「{shellTitle || type}」组件将在后续版本完善
      </div>
    );
  })();

  return (
    <>
      <WidgetShell
        title={shellTitle}
        selected={selected}
        readOnly={readOnly}
        contentBackground={shellStyle.contentBackground}
        titleColor={shellStyle.titleColor}
        borderColor={shellStyle.borderColor}
        borderWidth={shellStyle.borderWidth}
        onSelect={onSelect}
        onRename={() => {
          setRenameValue(shellTitle || '');
          setRenameOpen(true);
        }}
        onCopy={onCopy}
        onDelete={onDelete}
        onEdit={onEdit}
      >
        {body}
      </WidgetShell>
      <Modal
        title="重命名"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={() => {
          const name = renameValue.trim() || '未命名';
          onUpdate({
            title: name,
            config: { ...widget.config, title: name },
          });
          setRenameOpen(false);
        }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onPressEnter={() => {
            const name = renameValue.trim() || '未命名';
            onUpdate({ title: name, config: { ...widget.config, title: name } });
            setRenameOpen(false);
          }}
        />
      </Modal>
    </>
  );
});

export const DashboardCanvas: React.FC<DashboardCanvasProps> = ({
  dashboard,
  table,
  readOnly,
  dataVersion,
  globalFilters,
  onChange,
  onGlobalFiltersChange,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [showLayoutGuide, setShowLayoutGuide] = useState(false);
  const interactingRef = useRef(false);
  const columns = dashboard.layout.columns || 12;

  const rowHeight = dashboard.layout.rowHeight || 40;
  const gap = dashboard.layout.gap ?? 12;
  const canvasRef = React.useRef<HTMLDivElement>(null);

  const modelLayout = useMemo(
    () => toLayoutItems(dashboard.widgets, readOnly),
    [dashboard.widgets, readOnly],
  );

  // 交互中用本地 layout，保证边框跟手且不每帧写回 workbook
  const [liveLayout, setLiveLayout] = useState<Layout[]>(modelLayout);

  useEffect(() => {
    if (!interactingRef.current) {
      setLiveLayout(modelLayout);
    }
  }, [modelLayout]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const sync = () => setContainerWidth(Math.max(320, node.clientWidth - 32));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const updateWidgets = useCallback((widgets: DashboardWidget[]) => {
    onChange({ ...dashboard, widgets, updatedAt: Date.now() });
  }, [dashboard, onChange]);

  const commitLayout = useCallback((next: Layout[]) => {
    if (readOnly) return;
    const byId = new Map(next.map(l => [l.i, l]));
    let changed = false;
    const widgets = dashboard.widgets.map(w => {
      const l = byId.get(w.id);
      if (!l) return w;
      if (
        l.x === w.layout.x
        && l.y === w.layout.y
        && l.w === w.layout.w
        && l.h === w.layout.h
      ) {
        return w;
      }
      changed = true;
      return {
        ...w,
        layout: { x: l.x, y: l.y, w: l.w, h: l.h },
      };
    });
    if (changed) updateWidgets(widgets);
  }, [dashboard.widgets, readOnly, updateWidgets]);

  const beginInteraction = useCallback(() => {
    interactingRef.current = true;
    setShowLayoutGuide(true);
  }, []);

  const endInteraction = useCallback((next: Layout[], activeId?: string) => {
    interactingRef.current = false;
    setShowLayoutGuide(false);
    // 松手后再统一下推解冲突：定住当前卡片，把被压住的卡片往下推
    const resolved = resolveLayoutOverlaps(next, activeId);
    setLiveLayout(resolved);
    commitLayout(resolved);
  }, [commitLayout]);

  const guideRows = useMemo(() => {
    const occupied = liveLayout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    return Math.max(occupied + 2, 10);
  }, [liveLayout]);

  const guideHeight = guideRows * rowHeight + Math.max(0, guideRows - 1) * gap;

  const selectedWidget = selectedId
    ? dashboard.widgets.find(w => w.id === selectedId) ?? null
    : null;

  const selectWidget = (id: string) => {
    setSelectedId(prev => (prev === id ? prev : id));
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        background: '#f5f6f8',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        ref={canvasRef}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          padding: 16,
        }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.react-grid-item')) return;
          setSelectedId(null);
        }}
      >
        {dashboard.widgets.length === 0 ? (
          <div style={{
            height: '100%',
            minHeight: 280,
            display: 'grid',
            placeItems: 'center',
            color: '#8c8c8c',
            fontSize: 14,
          }}>
            点击「添加图表」开始搭建仪表盘
          </div>
        ) : (
          <div style={{ position: 'relative', minHeight: guideHeight }}>
            {showLayoutGuide && (
              <LayoutGuideOverlay
                width={containerWidth}
                cols={columns}
                rowHeight={rowHeight}
                gap={gap}
                rows={guideRows}
              />
            )}
            {/* react-grid-layout types incompatible with React 18 refs */}
            {/* @ts-ignore */}
            <GridLayout
              className="dashboard-grid-layout"
              layout={liveLayout}
              cols={columns}
              rowHeight={rowHeight}
              width={containerWidth}
              margin={[gap, gap]}
              containerPadding={[0, 0]}
              isDraggable={!readOnly}
              isResizable={!readOnly}
              draggableHandle=".dashboard-widget-drag-handle"
              draggableCancel=".dashboard-widget-no-drag,button,input,.ant-dropdown,.ant-dropdown-menu"
              resizeHandles={['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']}
              compactType={null}
              allowOverlap
              preventCollision={false}
              onDragStart={beginInteraction}
              onResizeStart={beginInteraction}
              onDragStop={(next, _oldItem, newItem) => endInteraction(next, newItem?.i)}
              onResizeStop={(next, _oldItem, newItem) => endInteraction(next, newItem?.i)}
              onLayoutChange={(next) => {
                // 交互中勿用受控 layout 回灌，避免边框不跟手、也不触发其他卡片跳动
                if (interactingRef.current) return;
                setLiveLayout(next);
                if (!layoutsEqual(next, modelLayout)) {
                  commitLayout(next);
                }
              }}
            >
              {dashboard.widgets.map(widget => (
                <div
                  key={widget.id}
                  className={`dashboard-grid-item-inner${selectedId === widget.id ? ' is-selected' : ''}`}
                >
                  {/* 内容层：与手柄兄弟；铺满 RGL 给出的像素宽高 */}
                  <div className="dashboard-grid-item-content">
                    <WidgetCell
                      widget={widget}
                      table={table}
                      selected={selectedId === widget.id}
                      readOnly={readOnly}
                      dataVersion={dataVersion}
                      globalFilters={globalFilters}
                      onSelect={() => selectWidget(widget.id)}
                      onUpdate={(patch) => {
                        updateWidgets(dashboard.widgets.map(w =>
                          w.id === widget.id ? { ...w, ...patch } : w,
                        ));
                      }}
                      onCopy={() => {
                        const copy: DashboardWidget = {
                          ...widget,
                          id: `w_copy_${Date.now()}`,
                          title: `${widget.title || '未命名'} 副本`,
                          layout: {
                            ...widget.layout,
                            y: widget.layout.y + widget.layout.h,
                          },
                        };
                        updateWidgets([...dashboard.widgets, copy]);
                        selectWidget(copy.id);
                      }}
                      onDelete={() => {
                        updateWidgets(dashboard.widgets.filter(w => w.id !== widget.id));
                        if (selectedId === widget.id) setSelectedId(null);
                      }}
                      onEdit={() => selectWidget(widget.id)}
                      onDataClick={(fieldId, category) => {
                        if (!fieldId || fieldId.startsWith('__time_') || !isBaseSheet(table.sheet)) return;
                        const colDef = table.sheet.columnDefs.find(c => c.id === fieldId);
                        const cond = createFilterConditionFromCell(
                          fieldId,
                          { type: 'text', text: category },
                          colDef,
                        );
                        onGlobalFiltersChange?.([cond]);
                        message.success(`已按「${category}」筛选，其它图表将联动刷新`);
                      }}
                    />
                  </div>
                </div>
              ))}
            </GridLayout>
          </div>
        )}
      </div>

      {selectedWidget && !readOnly && (
        <WidgetConfigSidebar
          widget={selectedWidget}
          table={table}
          readOnly={readOnly}
          onClose={() => setSelectedId(null)}
          onChange={(patch) => {
            updateWidgets(dashboard.widgets.map(w =>
              w.id === selectedWidget.id ? { ...w, ...patch } : w,
            ));
          }}
        />
      )}
    </div>
  );
};
