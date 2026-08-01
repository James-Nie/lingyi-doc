import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Checkbox, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { BASE_THEME, type FreeTable } from '@lingyi-doc/core-sheet';
import {
  GanttTaskData,
  GanttHeaderColumn,
  GanttMonthGroup,
  GanttWeekGroup,
  CALENDAR_COLORS,
  CalendarColorKey,
  GanttViewType,
  GanttTreeMeta,
  buildTaskTreeMeta,
  orderTasksAsTree,
} from './ganttUtils';
import { BaseRecordRowToolbar } from '../../BaseRecordRowToolbar';
import { BaseRecordContextMenu } from '../../BaseRecordContextMenu';
import { RecordDetailDrawer, type RecordDrawerTab } from '../../RecordDetailDrawer';

const LEFT_COL_WIDTH = 220;
const ROW_NUM_WIDTH = 40;
const ROW_HEIGHT: Record<GanttViewType, number> = { week: 40, month: 36, quarter: 30 };
const HEADER_HEIGHT = 36;
const BAR_HEIGHT_WEEK = 22;
const BAR_HEIGHT_MONTH = 18;
const BAR_HEIGHT_QUARTER = 14;
const BAR_RADIUS = 4;
const TREE_INDENT = 16;

const VIEW_CONFIG = {
  week: { barHeight: BAR_HEIGHT_WEEK, showLabelInBar: true, rowHeight: ROW_HEIGHT.week },
  month: { barHeight: BAR_HEIGHT_MONTH, showLabelInBar: false, rowHeight: ROW_HEIGHT.month },
  quarter: { barHeight: BAR_HEIGHT_QUARTER, showLabelInBar: false, rowHeight: ROW_HEIGHT.quarter },
} as const;

interface GanttGridProps {
  table: FreeTable;
  tasks: GanttTaskData[];
  headerColumns: GanttHeaderColumn[];
  monthGroups: GanttMonthGroup[];
  weekGroups: GanttWeekGroup[];
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
  pixelsPerDay: number;
  viewType: GanttViewType;
  onTaskClick: (task: GanttTaskData) => void;
  onRowClick?: (task: GanttTaskData) => void;
  onAddRecord?: () => void;
  leftHeaderLabel?: string;
  onExtendRange?: (direction: 'left' | 'right') => void;
}

const TaskBar: React.FC<{
  task: GanttTaskData;
  onClick: (e: React.MouseEvent) => void;
  barHeight: number;
  rowHeight: number;
  showLabelInBar: boolean;
}> = ({ task, onClick, barHeight, rowHeight, showLabelInBar }) => {
  const colors = CALENDAR_COLORS[task.color as CalendarColorKey] || CALENDAR_COLORS.blue;
  const barWidth = Math.max(task.widthPx - 4, 12);

  const barStyle: React.CSSProperties = {
    position: 'absolute',
    top: (rowHeight - barHeight) / 2,
    left: task.leftPx + 2,
    width: barWidth,
    height: barHeight,
    borderRadius: BAR_RADIUS,
    background: colors.border,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: showLabelInBar ? '0 4px' : '0 3px',
    overflow: 'hidden',
    transition: 'filter 0.15s, box-shadow 0.15s',
    boxShadow: '0 1px 3px rgba(51,112,255,0.15)',
    zIndex: 6,
  };

  const iconStyle: React.CSSProperties = {
    width: Math.max(8, barHeight - 14),
    height: Math.max(8, barHeight - 14),
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.7)',
    marginRight: 3,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: showLabelInBar ? 11 : 10,
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
    fontWeight: 500,
    textShadow: '0 1px 1px rgba(0,0,0,0.1)',
  };

  const durationStyle: React.CSSProperties = {
    fontSize: showLabelInBar ? 10 : 9,
    color: '#fff',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    background: 'rgba(255,255,255,0.25)',
    padding: '1px 3px',
    borderRadius: 3,
    marginLeft: 3,
  };

  return (
    <>
      <Tooltip title={`${task.title} (${task.durationDays}天)`} placement="top">
        <div
          style={barStyle}
          onClick={onClick}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.filter = 'brightness(0.95)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(51,112,255,0.3)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.filter = 'none';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(51,112,255,0.15)';
          }}
        >
          <span style={iconStyle}></span>
          {showLabelInBar && <span style={labelStyle}>{task.title}</span>}
          {showLabelInBar && task.widthPx > 40 && (
            <span style={durationStyle}>{task.durationDays}天</span>
          )}
        </div>
      </Tooltip>
      {!showLabelInBar && (
        <div
          onClick={onClick}
          style={{
            position: 'absolute',
            top: (rowHeight - barHeight) / 2,
            left: task.leftPx + barWidth + 6,
            height: barHeight,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: '#1f2329',
            whiteSpace: 'nowrap',
            zIndex: 6,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontWeight: 500 }}>{task.durationDays}天</span>
          <span style={{ color: '#646a73' }}>{task.title}</span>
        </div>
      )}
    </>
  );
};

const WeekendStripeStyle: React.CSSProperties = {
  backgroundImage: `repeating-linear-gradient(
    45deg,
    #f5f6f7,
    #f5f6f7 3px,
    #e8eaed 3px,
    #e8eaed 6px
  )`,
};

export const GanttGrid: React.FC<GanttGridProps> = ({
  table,
  tasks,
  headerColumns,
  monthGroups,
  weekGroups,
  pixelsPerDay,
  viewType,
  onTaskClick,
  onRowClick,
  onAddRecord,
  leftHeaderLabel,
  onExtendRange,
}) => {
  const rowHeight = ROW_HEIGHT[viewType];
  const viewCfg = VIEW_CONFIG[viewType];
  const totalDays = headerColumns.length;
  const totalWidth = totalDays * pixelsPerDay;
  const headerRowsHeight = viewType === 'quarter' ? HEADER_HEIGHT + 28 + 32 : HEADER_HEIGHT;

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollInfo, setScrollInfo] = useState({ scrollLeft: 0, clientWidth: 0 });

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
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setScrollInfo({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  const extendingRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollInfo({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth });

    if (!onExtendRange) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const EDGE_THRESHOLD = 100;

    if (el.scrollLeft < EDGE_THRESHOLD && !extendingRef.current.left) {
      extendingRef.current.left = true;
      onExtendRange('left');
      setTimeout(() => { extendingRef.current.left = false; }, 500);
    }
    if (maxScroll > 0 && el.scrollLeft >= maxScroll - EDGE_THRESHOLD && !extendingRef.current.right) {
      extendingRef.current.right = true;
      onExtendRange('right');
      setTimeout(() => { extendingRef.current.right = false; }, 500);
    }
  }, [onExtendRange]);

  const todayColumnIndex = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    return headerColumns.findIndex(col => col.key === today);
  }, [headerColumns]);

  const treeMeta = useMemo(() => buildTaskTreeMeta(tasks), [tasks]);
  const orderedTasks = useMemo(() => orderTasksAsTree(tasks, treeMeta), [tasks, treeMeta]);

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

  const handleContextMenu = useCallback((e: React.MouseEvent, task: GanttTaskData) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, task });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, task: null });
  }, []);

  const handleViewDetail = useCallback((rowIndex: number) => {
    setDetailRowIndex(rowIndex);
    setDetailDrawerTab('detail');
  }, []);

  const handleViewHistory = useCallback((rowIndex: number) => {
    setDetailRowIndex(rowIndex);
    setDetailDrawerTab('history');
  }, []);

  const handleAddChildRecord = useCallback((rowIndex: number) => {
    const parent = table.getRowRecord(rowIndex);
    table.insertChildRow(rowIndex);
    if (parent) {
      setCollapsedRecordIds(prev => {
        const next = new Set(prev);
        next.delete(parent._id);
        return next;
      });
    }
  }, [table]);

  const handleDeleteRecord = useCallback((rowIndex: number) => {
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
  }, [table, checkedRecordIds, tasks]);

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

  const visibleStart = scrollInfo.scrollLeft - LEFT_COL_WIDTH;

  const scrollToTask = useCallback(
    (task: GanttTaskData) => {
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      const newScrollLeft = Math.min(maxScroll, Math.max(0, task.leftPx + LEFT_COL_WIDTH - 24));
      el.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    },
    [],
  );

  const todayLeftPx = todayColumnIndex >= 0 ? todayColumnIndex * pixelsPerDay + pixelsPerDay / 2 : -1;

  const renderMonthHeader = () => {
    if (viewType !== 'quarter' && viewType !== 'month') return null;
    return (
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e6eb' }}>
        {monthGroups.map(group => (
          <div
            key={group.key}
            style={{
              width: group.colspan * pixelsPerDay,
              flexShrink: 0,
              height: HEADER_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fafbfc',
              borderLeft: '1px solid #e5e6eb',
              fontSize: 12,
              color: '#1f2329',
              fontWeight: 600,
            }}
          >
            {group.label}
          </div>
        ))}
      </div>
    );
  };

  const renderWeekHeader = () => {
    if (viewType !== 'quarter') return null;
    return (
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e6eb' }}>
        {weekGroups.map(group => (
          <div
            key={group.key}
            style={{
              width: group.colspan * pixelsPerDay,
              flexShrink: 0,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fafbfc',
              borderLeft: '1px solid #f0f1f2',
              fontSize: 11,
              color: '#646a73',
            }}
          >
            {group.label}
          </div>
        ))}
      </div>
    );
  };

  const renderDayHeader = () => (
    <div style={{ display: 'flex', borderBottom: '1px solid #e5e6eb' }}>
      {headerColumns.map(col => (
        <div
          key={col.key}
          style={{
            width: pixelsPerDay,
            flexShrink: 0,
            height: viewType === 'quarter' ? 32 : HEADER_HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: col.isToday ? '#f0f5ff' : '#fff',
            borderLeft: '1px solid #f0f1f2',
            ...(col.isWeekend ? WeekendStripeStyle : {}),
          }}
        >
          <span
            style={{
              fontSize: viewType === 'quarter' ? 10 : 12,
              color: col.isToday ? '#3370ff' : '#8f959e',
              fontWeight: col.isToday ? 600 : 400,
            }}
          >
            {col.label}
          </span>
        </div>
      ))}
    </div>
  );

  const getRowBg = (task: GanttTaskData, index: number) => {
    const isChecked = checkedRecordIds.has(task.recordId);
    const isHovered = hoveredRecordId === task.recordId;
    if (isChecked) return BASE_THEME.rowCheckedBg;
    if (isHovered) return BASE_THEME.rowHoverBg;
    return index % 2 === 1 ? '#fafbfc' : '#fff';
  };

  const renderLeftColCell = (task: GanttTaskData, index: number) => {
    const meta: GanttTreeMeta | undefined = treeMeta.get(task.recordId);
    const hasChildren = !!meta?.hasChildren;
    const depth = meta?.depth ?? 0;
    const isExpanded = !collapsedRecordIds.has(task.recordId);
    const isHovered = hoveredRecordId === task.recordId;
    const isChecked = checkedRecordIds.has(task.recordId);
    const showControls = isHovered || isChecked;
    const bg = getRowBg(task, index);

    return (
      <div
        key={task.recordId}
        onMouseEnter={() => setHoveredRecordId(task.recordId)}
        onMouseLeave={() => {
          setHoveredRecordId(null);
          setToolbarHoveredRecordId(null);
        }}
        onContextMenu={(e) => handleContextMenu(e, task)}
        style={{
          width: LEFT_COL_WIDTH,
          flexShrink: 0,
          height: rowHeight,
          background: bg,
          borderRight: '1px solid #f0f1f2',
          borderBottom: '1px solid #f5f6f7',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: ROW_NUM_WIDTH,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: '1px solid #f0f1f2',
            height: '100%',
          }}
        >
          {showControls ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#86909C', fontSize: 12, cursor: 'grab', userSelect: 'none' }}>≡</span>
              <Checkbox
                checked={isChecked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleCheck(task.recordId)}
                style={{ flexShrink: 0 }}
              />
            </div>
          ) : !hasChildren ? (
            <span style={{ fontSize: 11, color: '#8f959e' }}>{index + 1}</span>
          ) : null}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            paddingRight: 8,
            overflow: 'hidden',
          }}
        >
          {hasChildren && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(task.recordId);
              }}
              style={{
                fontSize: 9,
                color: '#666',
                cursor: 'pointer',
                transform: `rotate(${isExpanded ? 90 : 0}deg)`,
                transition: 'transform 0.15s',
                userSelect: 'none',
                display: 'inline-block',
                marginRight: 4,
                flexShrink: 0,
              }}
            >
              ▶
            </span>
          )}
          <Tooltip title={task.title} placement="top">
            <span
              style={{
                fontSize: 13,
                color: '#1f2329',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                paddingLeft: depth * TREE_INDENT,
              }}
            >
              {task.title}
            </span>
          </Tooltip>
        </div>
        {isHovered && (
          <BaseRecordRowToolbar
            rowIndex={task.rowIndex}
            cellRect={{ x: 0, y: 0, width: LEFT_COL_WIDTH, height: rowHeight }}
            onMouseEnter={() => setToolbarHoveredRecordId(task.recordId)}
            onMouseLeave={() => setToolbarHoveredRecordId(null)}
            onViewDetail={handleViewDetail}
            onAddChild={handleAddChildFromToolbar}
            showViewDetail={true}
            showAddChild={true}
          />
        )}
      </div>
    );
  };

  const renderTimelineCell = (task: GanttTaskData, index: number) => {
    const bg = getRowBg(task, index);
    const hasLeftData = task.startDate && task.leftPx < visibleStart;

    return (
      <div
        style={{
          width: totalWidth,
          flexShrink: 0,
          height: rowHeight,
          position: 'relative',
          borderBottom: '1px solid #f5f6f7',
          background: bg,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', pointerEvents: 'none' }}>
          {headerColumns.map(col => (
            <div
              key={col.key}
              style={{
                width: pixelsPerDay,
                flexShrink: 0,
                background: col.isToday ? '#f0f5ff' : 'transparent',
                borderLeft: '1px solid #f0f1f2',
                ...(col.isWeekend ? WeekendStripeStyle : {}),
              }}
            />
          ))}
        </div>
        {todayLeftPx >= 0 && (
          <div
            style={{
              position: 'absolute',
              left: todayLeftPx,
              top: 0,
              bottom: 0,
              width: 2,
              background: '#3370ff',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          />
        )}
        {hasLeftData && (
          <Tooltip title="滚动到该任务起始位置" placement="top">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                scrollToTask(task);
              }}
              style={{
                position: 'absolute',
                left: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1px solid #e5e6eb',
                background: 'rgba(255,255,255,0.92)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                color: '#646a73',
                fontSize: 10,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s, border-color 0.15s',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#3370ff';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3370ff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#646a73';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e6eb';
              }}
            >
              ←
            </button>
          </Tooltip>
        )}
        {task.startDate && (
          <TaskBar
            task={task}
            onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
            barHeight={viewCfg.barHeight}
            rowHeight={rowHeight}
            showLabelInBar={viewCfg.showLabelInBar}
          />
        )}
        {!task.startDate && (
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 11,
              color: '#c9cdd4',
              whiteSpace: 'nowrap',
            }}
          >
            未设置日期
          </div>
        )}
      </div>
    );
  };

  const checkedRowIndices = useMemo(() =>
    Array.from(checkedRecordIds)
      .map(id => tasks.find(t => t.recordId === id)?.rowIndex)
      .filter((idx): idx is number => idx != null),
  [checkedRecordIds, tasks]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ position: 'absolute', inset: 0, overflow: 'auto' }}
      >
        <div style={{ minWidth: '100%', position: 'relative' }}>
          <div style={{ display: 'flex' }}>
            <div
              style={{
                position: 'sticky',
                top: 0,
                left: 0,
                zIndex: 40,
                width: LEFT_COL_WIDTH,
                flexShrink: 0,
                background: '#fafbfc',
                borderRight: '1px solid #e5e6eb',
                borderBottom: '1px solid #e5e6eb',
                display: 'flex',
                height: headerRowsHeight,
              }}
            >
              <div
                style={{
                  width: ROW_NUM_WIDTH,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRight: '1px solid #f0f1f2',
                }}
              >
                <Checkbox style={{ flexShrink: 0 }} />
              </div>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  fontSize: 13,
                  color: '#646a73',
                  fontWeight: 500,
                }}
              >
                <span style={{ marginRight: 4, fontSize: 14 }}>☰</span>
                <span>{leftHeaderLabel || '任务名称'}</span>
              </div>
            </div>
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 30,
                width: totalWidth,
                flexShrink: 0,
                height: headerRowsHeight,
                background: '#fff',
              }}
            >
              {renderMonthHeader()}
              {renderWeekHeader()}
              {renderDayHeader()}
            </div>
          </div>

          <div style={{ display: 'flex', position: 'relative' }}>
            <div
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 20,
                width: LEFT_COL_WIDTH,
                flexShrink: 0,
                background: '#fff',
              }}
            >
              {visibleTasks.map((task, index) => renderLeftColCell(task, index))}
              <div
                onClick={onAddRecord}
                style={{
                  height: rowHeight,
                  display: 'flex',
                  alignItems: 'center',
                  borderRight: '1px solid #f0f1f2',
                  borderBottom: '1px solid #f5f6f7',
                  cursor: 'pointer',
                  color: '#8f959e',
                  fontSize: 14,
                  background: '#fff',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.color = '#3370ff';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.color = '#8f959e';
                }}
              >
                <div style={{ width: ROW_NUM_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #f0f1f2' }}>
                  <span>+</span>
                </div>
                <div style={{ flex: 1, paddingLeft: 8 }}>添加记录</div>
              </div>
            </div>

            <div style={{ width: totalWidth, flexShrink: 0, position: 'relative' }}>
              {visibleTasks.map((task, index) => (
                <div
                  key={task.recordId}
                  onClick={() => onRowClick?.(task)}
                  onContextMenu={(e) => handleContextMenu(e, task)}
                  style={{ display: 'flex', cursor: 'pointer' }}
                >
                  {renderTimelineCell(task, index)}
                </div>
              ))}
              <div style={{ height: rowHeight, borderBottom: '1px solid #f5f6f7' }} />
            </div>
          </div>
        </div>
      </div>

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

export default GanttGrid;