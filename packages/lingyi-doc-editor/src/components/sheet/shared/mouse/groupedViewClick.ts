import {
  groupHeaderRenderer,
  groupedRowControlsRenderer,
  isLayoutRowSelectable,
  resolveRowControlLevel,
} from '@lingyi-doc/core';
import { useSheetStore } from '../../../../store/sheetStore';
import { resolveSelectedRowIndices } from '../../../../utils/axisSelection';
import type { SheetInteractionDeps } from '../sheetInteraction.types';

export type GroupedViewClickResult = 'handled' | 'blocked' | 'none';

/** 分组视图行内控件点击（折叠 / 添加记录 / 复选框） */
export function handleGroupedViewRowClick(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  displayRow: number,
  d: SheetInteractionDeps,
): GroupedViewClickResult {
  const {
    groupLayout,
    isGroupedView,
    viewportRef,
    sheet,
    displayRowHeights,
    resolveGroupedCardLeft,
    toggleGroupCollapse,
    insertRecordInGroup,
    checkedRecordRowSet,
    activeHoverRow,
    discreteAxisRows,
    setCheckedRows,
    dirtyTrackerRef,
    scheduleRender,
  } = d;

  if (!isGroupedView || !groupLayout) return 'none';

  const item = groupLayout.items[displayRow];
  if (!item) return 'none';

  const rowRect = viewportRef.current.getCellRect(
    { row: displayRow, col: 0 },
    sheet.columnWidths,
    displayRowHeights,
  );
  const cardLeft = resolveGroupedCardLeft();
  const dataRelX = clientX - canvasRect.left - cardLeft;
  const relY = clientY - canvasRect.top - rowRect.y;
  const zoom = viewportRef.current.zoomLevel;

  if (item.type === 'group-header') {
    const action = groupHeaderRenderer.hitTestGroupHeader(
      dataRelX, relY, item, rowRect.height, zoom,
    );
    if (action === 'toggle') {
      toggleGroupCollapse(item.groupPathKey);
      scheduleRender();
    }
    return 'handled';
  }

  if (item.type === 'add-record') {
    if (groupHeaderRenderer.hitTestAddRecordRow(dataRelX, relY, item.level, zoom)) {
      insertRecordInGroup(item.groupContext, item.groupPathKey, displayRow);
      scheduleRender();
    }
    return 'handled';
  }

  if (item.type === 'record') {
    const level = resolveRowControlLevel(groupLayout.items, displayRow);
    const isChecked = checkedRecordRowSet.has(item.recordIndex);
    const selRange = useSheetStore.getState().selectionRange;
    const selectedRowsNow = resolveSelectedRowIndices(discreteAxisRows, selRange, sheet.colCount);
    const showControls = isChecked
      || displayRow === activeHoverRow
      || displayRow === (useSheetStore.getState().activeCell?.row ?? null)
      || selectedRowsNow.includes(displayRow);
    const controlAction = groupedRowControlsRenderer.hitTestRecordControls(
      dataRelX, relY, rowRect.height, level, zoom, showControls,
    );
    if (controlAction === 'checkbox') {
      setCheckedRows(prev => {
        const newSet = new Set(prev);
        if (newSet.has(item.recordIndex)) newSet.delete(item.recordIndex);
        else newSet.add(item.recordIndex);
        return Array.from(newSet);
      });
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return 'handled';
    }
    if (controlAction === 'drag') return 'handled';
    return 'none';
  }

  return isLayoutRowSelectable(item) ? 'none' : 'blocked';
}
