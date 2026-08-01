import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dayjs } from 'dayjs';
import { ViewportManager, BASE_THEME } from '@lingyi-doc/core-sheet';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import {
  GanttRenderer,
  type GanttRenderConfig,
  type GanttRenderHeaderColumn,
  type GanttRenderMonthGroup,
  type GanttRenderTask,
  type GanttRenderWeekGroup,
  type GanttTreeInfo,
  type GanttColorKey,
  type GanttHeaderViewType,
} from '@lingyi-doc/core-sheet';
import {
  GanttTaskData,
  GanttHeaderColumn,
  GanttMonthGroup,
  GanttWeekGroup,
  GanttViewType,
  buildTaskTreeMeta,
  orderTasksAsTree,
} from './ganttUtils';
import { BaseRecordRowToolbar } from '../../BaseRecordRowToolbar';
import { BaseRecordContextMenu } from '../../BaseRecordContextMenu';
import { RecordDetailDrawer, type RecordDrawerTab } from '../../RecordDetailDrawer';

interface GanttCanvasViewProps {
  table: FreeTable;
  tasks: GanttTaskData[];
  headerColumns: GanttHeaderColumn[];
  monthGroups: GanttMonthGroup[];
  weekGroups: GanttWeekGroup[];
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
  pixelsPerDay: number;
  viewType: GanttViewType;
  headerViewType?: GanttHeaderViewType;
  onTaskClick: (task: GanttTaskData) => void;
  onRowClick?: (task: GanttTaskData) => void;
  onAddRecord?: () => void;
  leftHeaderLabel?: string;
  onExtendRange?: (direction: 'left' | 'right') => void;
}

const LEFT_COL_WIDTH = 220;
const ROW_NUM_WIDTH = 40;
const ROW_HEIGHT: Record<GanttViewType, number> = { week: 40, month: 36, quarter: 30 };
const BAR_HEIGHT: Record<GanttViewType, number> = { week: 22, month: 18, quarter: 14 };
const BAR_RADIUS = 4;
const TREE_INDENT = 16;
const HEADER_MONTH_H = 36;
const HEADER_WEEK_H = 28;

function toRenderTask(task: GanttTaskData): GanttRenderTask {
  return {
    recordId: task.recordId,
    rowIndex: task.rowIndex,
    title: task.title,
    startDate: task.startDate ? task.startDate.toISOString() : null,
    endDate: task.endDate ? task.endDate.toISOString() : null,
    color: (task.color as GanttColorKey) || 'blue',
    durationDays: task.durationDays,
    leftPx: task.leftPx,
    widthPx: task.widthPx,
  };
}

function toRenderHeaderColumn(col: GanttHeaderColumn): GanttRenderHeaderColumn {
  return { key: col.key, label: col.label, isToday: col.isToday, isWeekend: col.isWeekend };
}

function toRenderMonthGroup(g: GanttMonthGroup): GanttRenderMonthGroup {
  return { key: g.key, label: g.label, colspan: g.colspan };
}

function toRenderWeekGroup(g: GanttWeekGroup): GanttRenderWeekGroup {
  return { key: g.key, label: g.label, colspan: g.colspan };
}

function toTreeInfo(meta: ReturnType<typeof buildTaskTreeMeta>): Map<string, GanttTreeInfo> {
  const result = new Map<string, GanttTreeInfo>();
  for (const [id, m] of meta) {
    result.set(id, { depth: m.depth, hasChildren: m.hasChildren });
  }
  return result;
}

export const GanttCanvasView: React.FC<GanttCanvasViewProps> = ({
  table,
  tasks,
  headerColumns,
  monthGroups,
  weekGroups,
  rangeStart,
  rangeEnd,
  pixelsPerDay,
  viewType,
  headerViewType = 'month',
  onTaskClick,
  onRowClick,
  onAddRecord,
  leftHeaderLabel,
  onExtendRange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GanttRenderer | null>(null);
  const viewportRef = useRef(new ViewportManager());

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null);
  const [toolbarHoveredRecordId, setToolbarHoveredRecordId] = useState<string | null>(null);
  const [checkedRecordIds, setCheckedRecordIds] = useState<Set<string>>(new Set());
  const [collapsedRecordIds, setCollapsedRecordIds] = useState<Set<string>>(new Set());

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    task: GanttTaskData | null;
  }>({ visible: false, x: 0, y: 0, task: null });

  const [detailRowIndex, setDetailRowIndex] = useState<number | null>(null);
  const [detailDrawerTab, setDetailDrawerTab] = useState<RecordDrawerTab>('detail');

  useEffect(() => {
    rendererRef.current = new GanttRenderer(viewportRef.current);
  }, []);

  // ==================== 数据派生 ====================

  const treeMeta = useMemo(() => buildTaskTreeMeta(tasks), [tasks]);
  const orderedTasks = useMemo(() => orderTasksAsTree(tasks, treeMeta), [tasks, treeMeta]);
  const treeInfo = useMemo(() => toTreeInfo(treeMeta), [treeMeta]);

  const visibleTasks = useMemo(() => {
    return orderedTasks.filter(t => {
      const seen = new Set<string>();
      let parentId = treeMeta.get(t.recordId)?.parentId || null;
      while (parentId && treeMeta.has(parentId) && !seen.has(parentId)) {
        seen.add(parentId);
        if (collapsedRecordIds.has(parentId)) return false;
        parentId = treeMeta.get(parentId)?.parentId || null;
      }
      return true;
    });
  }, [orderedTasks, treeMeta, collapsedRecordIds]);

  const renderConfig = useMemo((): GanttRenderConfig => {
    return {
      viewType,
      headerViewType,
      pixelsPerDay,
      leftColWidth: LEFT_COL_WIDTH,
      rowNumWidth: ROW_NUM_WIDTH,
      rowHeight: ROW_HEIGHT[viewType],
      barHeight: BAR_HEIGHT[viewType],
      showLabelInBar: viewType === 'week',
      headerMonthHeight: headerViewType === 'month' ? HEADER_MONTH_H : 0,
      headerWeekHeight: headerViewType === 'week' ? HEADER_WEEK_H : 0,
      headerDayHeight: 36,
      barRadius: BAR_RADIUS,
      treeIndent: TREE_INDENT,
      leftHeaderLabel,
    };
  }, [viewType, headerViewType, pixelsPerDay, leftHeaderLabel]);

  const renderData = useMemo(() => {
    return {
      tasks: visibleTasks.map(toRenderTask),
      headerColumns: headerColumns.map(toRenderHeaderColumn),
      monthGroups: monthGroups.map(toRenderMonthGroup),
      weekGroups: weekGroups.map(toRenderWeekGroup),
      treeInfo,
    };
  }, [visibleTasks, headerColumns, monthGroups, weekGroups, treeInfo]);

  // ==================== 渲染 ====================

  const performRenderRef = useRef<() => void>(() => {});

  performRenderRef.current = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerSize.width;
    const h = containerSize.height;
    if (w <= 0 || h <= 0) return;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const state = {
      hoveredRecordId,
      checkedRecordIds,
      collapsedRecordIds,
    };

    renderer.render(
      ctx,
      renderConfig,
      renderData.tasks,
      renderData.headerColumns,
      renderData.monthGroups,
      renderData.weekGroups,
      renderData.treeInfo,
      scrollTop,
      scrollLeft,
      w,
      h,
      state,
    );
  }, [containerSize, renderConfig, renderData, scrollTop, scrollLeft, hoveredRecordId, checkedRecordIds, collapsedRecordIds]);

  const frameRef = useRef(0);
  const scheduleRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      performRenderRef.current();
    });
  }, []);

  useEffect(() => {
    scheduleRender();
  });

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    observer.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // ==================== 滚动 ====================

  const maxScroll = useMemo(() => {
    const totalWidth = headerColumns.length * pixelsPerDay;
    const maxLeft = Math.max(0, totalWidth - (containerSize.width - LEFT_COL_WIDTH));
    const headerH = renderConfig.headerMonthHeight + renderConfig.headerWeekHeight + renderConfig.headerDayHeight;
    const totalH = headerH + visibleTasks.length * ROW_HEIGHT[viewType] + ROW_HEIGHT[viewType];
    const maxTop = Math.max(0, totalH - containerSize.height);
    return { maxLeft, maxTop };
  }, [headerColumns, pixelsPerDay, containerSize, visibleTasks, viewType, renderConfig]);

  const extendCooldownRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const prevRangeRef = useRef<{ rangeStart: Dayjs; rangeEnd: Dayjs } | null>(null);

  // 向左扩展范围时 rangeStart 左移，所有任务 leftPx 右移，
  // 需同步增大 scrollLeft，避免视口内数据"消失"
  useEffect(() => {
    const prev = prevRangeRef.current;
    if (prev) {
      const endUnchanged = prev.rangeEnd.isSame(rangeEnd, 'day');
      const startMovedEarlier = rangeStart.isBefore(prev.rangeStart);
      if (endUnchanged && startMovedEarlier) {
        const diffDays = prev.rangeStart.diff(rangeStart, 'day');
        const shift = diffDays * pixelsPerDay;
        setScrollLeft(prevLeft =>
          Math.max(0, Math.min(maxScroll.maxLeft, prevLeft + shift)),
        );
      }
    }
    prevRangeRef.current = { rangeStart, rangeEnd };
  }, [rangeStart, rangeEnd, pixelsPerDay, maxScroll.maxLeft]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const dx = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      const dy = e.shiftKey ? 0 : e.deltaY;

      setScrollLeft(prev => Math.max(0, Math.min(maxScroll.maxLeft, prev + dx)));
      setScrollTop(prev => Math.max(0, Math.min(maxScroll.maxTop, prev + dy)));

      if (!onExtendRange) return;
      const EDGE_THRESHOLD = 100;
      const nextLeft = Math.max(0, Math.min(maxScroll.maxLeft, scrollLeft + dx));
      if (nextLeft < EDGE_THRESHOLD && !extendCooldownRef.current.left) {
        extendCooldownRef.current.left = true;
        onExtendRange('left');
        setTimeout(() => { extendCooldownRef.current.left = false; }, 500);
      }
      if (maxScroll.maxLeft > 0 && nextLeft >= maxScroll.maxLeft - EDGE_THRESHOLD && !extendCooldownRef.current.right) {
        extendCooldownRef.current.right = true;
        onExtendRange('right');
        setTimeout(() => { extendCooldownRef.current.right = false; }, 500);
      }
    },
    [maxScroll, onExtendRange, scrollLeft],
  );

  // ==================== 交互 ====================

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const pt = getCanvasPoint(e);
      const result = renderer.hitTest(pt.x, pt.y);
      if (
        result.type === 'left-cell' ||
        result.type === 'task-bar' ||
        result.type === 'collapse-btn' ||
        result.type === 'checkbox' ||
        result.type === 'scroll-back-btn'
      ) {
        if (result.recordId) setHoveredRecordId(result.recordId);
      } else if (result.type === 'add-row' || result.type === 'header-checkbox' || result.type === 'header') {
        setHoveredRecordId(null);
      } else {
        setHoveredRecordId(null);
      }
    },
    [getCanvasPoint],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredRecordId(null);
    setToolbarHoveredRecordId(null);
  }, []);

  const toggleCollapse = useCallback((recordId: string) => {
    setCollapsedRecordIds(prev => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }, []);

  const toggleCheck = useCallback((recordId: string) => {
    setCheckedRecordIds(prev => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }, []);

  const scrollToTask = useCallback(
    (task: GanttTaskData) => {
      const target = Math.max(0, Math.min(maxScroll.maxLeft, task.leftPx - 24));
      setScrollLeft(target);
    },
    [maxScroll],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const pt = getCanvasPoint(e);
      const result = renderer.hitTest(pt.x, pt.y);

      if (result.type === 'task-bar' && result.recordId) {
        const task = tasks.find(t => t.recordId === result.recordId);
        if (task) onTaskClick(task);
      } else if (result.type === 'left-cell' && result.recordId) {
        const task = tasks.find(t => t.recordId === result.recordId);
        if (task) onRowClick?.(task);
      } else if (result.type === 'collapse-btn' && result.recordId) {
        toggleCollapse(result.recordId);
      } else if (result.type === 'checkbox' && result.recordId) {
        toggleCheck(result.recordId);
      } else if (result.type === 'scroll-back-btn' && result.recordId) {
        const task = tasks.find(t => t.recordId === result.recordId);
        if (task) scrollToTask(task);
      } else if (result.type === 'header-checkbox') {
        if (checkedRecordIds.size === visibleTasks.length && visibleTasks.length > 0) {
          setCheckedRecordIds(new Set());
        } else {
          setCheckedRecordIds(new Set(visibleTasks.map(t => t.recordId)));
        }
      } else if (result.type === 'add-row') {
        onAddRecord?.();
      }
    },
    [getCanvasPoint, tasks, onTaskClick, onRowClick, toggleCollapse, toggleCheck, scrollToTask, checkedRecordIds, visibleTasks, onAddRecord],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const renderer = rendererRef.current;
      if (!renderer) return;
      const pt = getCanvasPoint(e);
      const result = renderer.hitTest(pt.x, pt.y);
      if (result.type === 'left-cell' || result.type === 'task-bar') {
        const task = tasks.find(t => t.recordId === result.recordId);
        if (task) {
          setContextMenu({ visible: true, x: e.clientX, y: e.clientY, task });
        }
      }
    },
    [getCanvasPoint, tasks],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, task: null });
  }, []);

  // ==================== 记录操作（与 DOM 版一致） ====================

  const handleViewDetail = useCallback((rowIndex: number) => {
    setDetailRowIndex(rowIndex);
    setDetailDrawerTab('detail');
  }, []);

  const handleViewHistory = useCallback((rowIndex: number) => {
    setDetailRowIndex(rowIndex);
    setDetailDrawerTab('history');
  }, []);

  const handleAddChildRecord = useCallback(
    (rowIndex: number) => {
      const parent = table.getRowRecord(rowIndex);
      table.insertChildRow(rowIndex);
      if (parent) {
        setCollapsedRecordIds(prev => {
          const next = new Set(prev);
          next.delete(parent._id);
          return next;
        });
      }
    },
    [table],
  );

  const handleDeleteRecord = useCallback(
    (rowIndex: number) => {
      const checkedIndices = Array.from(checkedRecordIds)
        .map(id => tasks.find(t => t.recordId === id)?.rowIndex)
        .filter((idx): idx is number => idx != null);
      if (checkedIndices.length > 1 && checkedIndices.includes(rowIndex)) {
        const sorted = [...checkedIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          table.deleteRows(idx, 1);
        }
        setCheckedRecordIds(new Set());
      } else {
        table.deleteRows(rowIndex, 1);
        setCheckedRecordIds(prev => {
          const next = new Set(prev);
          const task = tasks.find(t => t.rowIndex === rowIndex);
          if (task) next.delete(task.recordId);
          return next;
        });
      }
    },
    [table, checkedRecordIds, tasks],
  );

  const handleInsertRowsAbove = useCallback((rowIndex: number, count: number) => {
    table.insertRows(rowIndex, count);
  }, [table]);

  const handleInsertRowsBelow = useCallback((rowIndex: number, count: number) => {
    table.insertRows(rowIndex + 1, count);
  }, [table]);

  const handleAddChildFromToolbar = useCallback((rowIndex: number) => {
    handleAddChildRecord(rowIndex);
  }, [handleAddChildRecord]);

  const handleNavigateDetail = useCallback((rowIndex: number) => {
    setDetailRowIndex(rowIndex);
  }, []);

  const handleCloseDetailDrawer = useCallback(() => {
    setDetailRowIndex(null);
  }, []);

  const checkedRowIndices = useMemo(
    () =>
      Array.from(checkedRecordIds)
        .map(id => tasks.find(t => t.recordId === id)?.rowIndex)
        .filter((idx): idx is number => idx != null),
    [checkedRecordIds, tasks],
  );

  // ==================== hover 工具栏定位 ====================

  const hoveredRecordIdEffective = hoveredRecordId ?? toolbarHoveredRecordId;

  const toolbarRect = useMemo(() => {
    if (!hoveredRecordIdEffective) return null;
    const idx = visibleTasks.findIndex(t => t.recordId === hoveredRecordIdEffective);
    if (idx < 0) return null;
    const headerH =
      renderConfig.headerMonthHeight + renderConfig.headerWeekHeight + renderConfig.headerDayHeight;
    const y = headerH + idx * renderConfig.rowHeight - scrollTop;
    return { x: 0, y, width: LEFT_COL_WIDTH, height: renderConfig.rowHeight };
  }, [hoveredRecordIdEffective, visibleTasks, renderConfig, scrollTop]);

  const hoveredTask = useMemo(() => {
    if (!hoveredRecordIdEffective) return null;
    return tasks.find(t => t.recordId === hoveredRecordIdEffective) || null;
  }, [hoveredRecordIdEffective, tasks]);

  const showToolbar = !!hoveredTask && !!toolbarRect;

  // ==================== 渲染 ====================

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
        border: `1px solid ${BASE_THEME.cardBorder}`,
        borderRadius: BASE_THEME.cardRadius,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          cursor: 'pointer',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      />

      {showToolbar && hoveredTask && toolbarRect && (
        <div
          style={{
            position: 'absolute',
            left: toolbarRect.x,
            top: toolbarRect.y,
            width: toolbarRect.width,
            height: toolbarRect.height,
            pointerEvents: 'none',
          }}
        >
          <BaseRecordRowToolbar
            rowIndex={hoveredTask.rowIndex}
            cellRect={{ x: 0, y: 0, width: toolbarRect.width, height: toolbarRect.height }}
            onMouseEnter={() => setToolbarHoveredRecordId(hoveredTask.recordId)}
            onMouseLeave={() => setToolbarHoveredRecordId(null)}
            onViewDetail={handleViewDetail}
            onAddChild={handleAddChildFromToolbar}
            showViewDetail={true}
            showAddChild={true}
          />
        </div>
      )}

      {contextMenu.visible && contextMenu.task && (
        <BaseRecordContextMenu
          visible
          x={contextMenu.x}
          y={contextMenu.y}
          rowIndex={contextMenu.task.rowIndex}
          colIndex={0}
          table={table}
          onClose={closeContextMenu}
          onInsertRowsAbove={handleInsertRowsAbove}
          onInsertRowsBelow={handleInsertRowsBelow}
          onViewDetail={handleViewDetail}
          onViewHistory={handleViewHistory}
          onAddChildRecord={handleAddChildRecord}
          onAddComment={() => {}}
          onFilterByCell={() => {}}
          onDeleteRecord={handleDeleteRecord}
          selectedRowIndices={checkedRowIndices}
          showRecordDetailActions={true}
          commentsEnabled={false}
        />
      )}

      <RecordDetailDrawer
        visible={detailRowIndex !== null}
        rowIndex={detailRowIndex}
        table={table}
        initialTab={detailDrawerTab}
        onClose={handleCloseDetailDrawer}
        onNavigate={handleNavigateDetail}
      />
    </div>
  );
};

export default GanttCanvasView;
