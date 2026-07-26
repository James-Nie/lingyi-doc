import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSheetStore } from '../../store/sheetStore';
import { ColorPicker } from './ColorPicker';
import { BorderPicker, type BorderPreset } from './BorderPicker';
import { FontSelector } from './FontSelector';
import { NumberFormatToolbar } from './NumberFormatToolbar';
import { FormulaDropdown } from './FormulaDropdown';
import { ToolbarTooltip, modShortcut, redoShortcut } from './Tooltip';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { FreezeDropdown } from './FreezeDropdown';
import { InsertDropdown } from './InsertDropdown';
import { SheetFindReplacePanel } from './SheetFindReplacePanel';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import {
  applyFormatMenuKey,
  getFilteredColumnIndices,
  createBorderSide,
  patchExistingBorderSides,
  findInSheet,
  replaceSheetMatch,
  replaceAllInSheet,
  type BorderLineStyle,
  type SheetFindMatch,
  type SheetFindReplaceOptions,
} from '@lingyi-doc/core-sheet';
import { getEditText, DEFAULT_CELL_STYLE } from '@lingyi-doc/core-types';

interface ToolbarProps {
  table: FreeTable;
  onInsertChart?: () => void;
  /** 是否启用评论功能 */
  commentsEnabled?: boolean;
  /** 评论面板是否展开 */
  commentPanelOpen?: boolean;
  /** 切换评论面板显隐 */
  onToggleCommentPanel?: () => void;
}

const TOOLBAR_BG = '#f3f4f5';
const ACTIVE_COLOR = '#1a73e8';
const ICON_COLOR = '#444';
const LABEL_COLOR = '#666';

const divider = (
  <div style={{ width: 1, height: 44, background: '#dcdcdc', margin: '0 6px', flexShrink: 0 }} />
);

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

const NONE_BORDER_SIDE = { color: '#000000', style: 'none' as const };

const selectStyle: React.CSSProperties = {
  padding: '2px 4px',
  border: '1px solid #d0d0d0',
  borderRadius: 3,
  background: '#fff',
  fontSize: 12,
  cursor: 'pointer',
  height: 24,
  color: '#333',
};

const iconBtnStyle = (active?: boolean, disabled?: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: 'none',
  borderRadius: 3,
  background: 'transparent',
  color: disabled ? '#bbb' : active ? ACTIVE_COLOR : ICON_COLOR,
  cursor: disabled ? 'default' : 'pointer',
  fontSize: 13,
  padding: 0,
  flexShrink: 0,
});

const labeledBtnWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  padding: '2px 4px',
  minWidth: 36,
  cursor: 'pointer',
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: LABEL_COLOR,
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

function ToolbarLabeledBtn({
  icon,
  label,
  active,
  disabled,
  onClick,
  onDoubleClick,
  showChevron,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  showChevron?: boolean;
  shortcut?: string;
}) {
  return (
    <ToolbarTooltip label={label} shortcut={shortcut} active={active} disabled={disabled}>
      <button
        type="button"
        style={{
          ...labeledBtnWrap,
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? 'default' : 'pointer',
          background: active ? '#e8f0fe' : 'transparent',
        }}
        onClick={disabled ? undefined : onClick}
        onDoubleClick={disabled ? undefined : onDoubleClick}
        disabled={disabled}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 1, height: 22, color: active ? ACTIVE_COLOR : ICON_COLOR }}>
          {icon}
          {showChevron && (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
              <path d="M7 10l5 5 5-5z" />
            </svg>
          )}
        </span>
        <span style={{ ...labelStyle, color: active ? ACTIVE_COLOR : LABEL_COLOR }}>{label}</span>
      </button>
    </ToolbarTooltip>
  );
}

function AlignIconBtn({
  active,
  title,
  onClick,
  children,
  shortcut,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  shortcut?: string;
}) {
  return (
    <ToolbarTooltip label={title} shortcut={shortcut} active={active}>
      <button type="button" style={iconBtnStyle(active)} onClick={onClick}>
        {children}
      </button>
    </ToolbarTooltip>
  );
}

export const Toolbar: React.FC<ToolbarProps> = ({
  table,
  onInsertChart,
  commentsEnabled = false,
  commentPanelOpen = false,
  onToggleCommentPanel,
}) => {
  const boldActive = useSheetStore(s => s.boldActive);
  const italicActive = useSheetStore(s => s.italicActive);
  const underlineActive = useSheetStore(s => s.underlineActive);
  const strikethroughActive = useSheetStore(s => s.strikethroughActive);
  const currentFontSize = useSheetStore(s => s.currentFontSize);
  const currentFontFamily = useSheetStore(s => s.currentFontFamily);
  const fontColor = useSheetStore(s => s.fontColor);
  const backgroundColor = useSheetStore(s => s.backgroundColor);
  const borderColor = useSheetStore(s => s.borderColor);
  const borderLineStyle = useSheetStore(s => s.borderLineStyle);
  const horizontalAlign = useSheetStore(s => s.horizontalAlign);
  const verticalAlign = useSheetStore(s => s.verticalAlign);
  const textWrapActive = useSheetStore(s => s.textWrapActive);
  const numberFormat = useSheetStore(s => s.numberFormat);
  const formatPainterActive = useSheetStore(s => s.formatPainterActive);
  const formatPainterSource = useSheetStore(s => s.formatPainterSource);
  const activeCell = useSheetStore(s => s.activeCell);
  const selectionRange = useSheetStore(s => s.selectionRange);

  const setBoldActive = useSheetStore(s => s.setBoldActive);
  const setItalicActive = useSheetStore(s => s.setItalicActive);
  const setUnderlineActive = useSheetStore(s => s.setUnderlineActive);
  const setStrikethroughActive = useSheetStore(s => s.setStrikethroughActive);
  const setFontSize = useSheetStore(s => s.setFontSize);
  const setFontFamily = useSheetStore(s => s.setFontFamily);
  const setFontColor = useSheetStore(s => s.setFontColor);
  const setBackgroundColor = useSheetStore(s => s.setBackgroundColor);
  const setBorderColor = useSheetStore(s => s.setBorderColor);
  const setBorderLineStyle = useSheetStore(s => s.setBorderLineStyle);
  const setHorizontalAlign = useSheetStore(s => s.setHorizontalAlign);
  const setVerticalAlign = useSheetStore(s => s.setVerticalAlign);
  const setTextWrapActive = useSheetStore(s => s.setTextWrapActive);
  const setNumberFormat = useSheetStore(s => s.setNumberFormat);
  const setFormatPainterActive = useSheetStore(s => s.setFormatPainterActive);
  const setStatusText = useSheetStore(s => s.setStatusText);
  const setSelection = useSheetStore(s => s.setSelection);
  const setFindHighlights = useSheetStore(s => s.setFindHighlights);
  const setFindActiveIndex = useSheetStore(s => s.setFindActiveIndex);
  const requestScrollToCell = useSheetStore(s => s.requestScrollToCell);
  const setFormulaBarText = useSheetStore(s => s.setFormulaBarText);

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findMatches, setFindMatches] = useState<SheetFindMatch[]>([]);
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchEntireCell, setMatchEntireCell] = useState(false);
  const findReplaceAnchorRef = useRef<HTMLDivElement>(null);
  const findOptionsRef = useRef<SheetFindReplaceOptions>({});
  findOptionsRef.current = { caseSensitive, matchEntireCell };

  const filterEnabled = table.isColumnFilterEnabled();
  const columnFilters = table.getColumnFilters();
  const columnFilterCount = getFilteredColumnIndices(columnFilters).length;

  const syncFindToStore = useCallback((matches: SheetFindMatch[], activeIndex: number, open: boolean) => {
    setFindHighlights(
      open,
      matches.map(m => ({ row: m.row, col: m.col })),
      activeIndex,
    );
  }, [setFindHighlights]);

  const focusMatch = useCallback((matches: SheetFindMatch[], index: number) => {
    if (!matches.length) {
      setFindMatchIndex(0);
      setFindActiveIndex(0);
      return;
    }
    const safe = ((index % matches.length) + matches.length) % matches.length;
    const match = matches[safe];
    setFindMatchIndex(safe);
    setFindActiveIndex(safe);
    syncFindToStore(matches, safe, true);
    setSelection(
      { sheetId: table.sheetId, start: match, end: match },
      match,
    );
    const cell = table.getCell(match.row, match.col);
    setFormulaBarText(cell ? getEditText(cell.value) : '');
    requestScrollToCell(match.row, match.col);
  }, [
    table,
    setSelection,
    setFormulaBarText,
    requestScrollToCell,
    setFindActiveIndex,
    syncFindToStore,
  ]);

  const runFind = useCallback((query = findQuery, preferNext = false) => {
    const q = query;
    if (!q) {
      setFindMatches([]);
      setFindMatchIndex(0);
      syncFindToStore([], 0, showFindReplace);
      setStatusText('请输入查找内容');
      return;
    }
    const matches = findInSheet(table, q, findOptionsRef.current);
    setFindMatches(matches);
    if (!matches.length) {
      setFindMatchIndex(0);
      syncFindToStore([], 0, true);
      setStatusText('未找到匹配项');
      return;
    }
    const nextIndex = preferNext && findMatches.length > 0
      ? (findMatchIndex + 1) % matches.length
      : 0;
    focusMatch(matches, nextIndex);
    setStatusText(`找到 ${matches.length} 处匹配`);
  }, [
    findQuery,
    table,
    showFindReplace,
    syncFindToStore,
    setStatusText,
    findMatches.length,
    findMatchIndex,
    focusMatch,
  ]);

  const openFindReplace = useCallback(() => {
    setShowFindReplace(true);
    // 仅打开面板，等用户点击「查找」后再搜索
    syncFindToStore([], 0, true);
  }, [syncFindToStore]);

  const closeFindReplace = useCallback(() => {
    setShowFindReplace(false);
    setFindMatches([]);
    setFindMatchIndex(0);
    setFindHighlights(false);
  }, [setFindHighlights]);

  const clearFindResults = useCallback(() => {
    setFindMatches([]);
    setFindMatchIndex(0);
    if (showFindReplace) syncFindToStore([], 0, true);
  }, [showFindReplace, syncFindToStore]);

  const handleFindQueryChange = useCallback((value: string) => {
    setFindQuery(value);
    // 输入变更不清空逻辑触发搜索，仅清除上次结果
    clearFindResults();
  }, [clearFindResults]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'f' && key !== 'h') return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
          && !target.closest('[data-sheet-find-replace-panel]')
        ) {
          // 公式栏等输入中仍允许 Cmd+F 打开查找
          if (!target.closest('[data-sheet-keep-selection]')) return;
        }
      }
      e.preventDefault();
      if (showFindReplace && key === 'f') {
        findReplaceAnchorRef.current?.focus?.();
        return;
      }
      openFindReplace();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openFindReplace, showFindReplace]);

  const handleFindPrev = useCallback(() => {
    if (!findMatches.length) {
      runFind(findQuery, false);
      return;
    }
    focusMatch(findMatches, findMatchIndex - 1);
  }, [findMatches, findMatchIndex, focusMatch, runFind, findQuery]);

  const handleFindNext = useCallback(() => {
    if (!findMatches.length) {
      runFind(findQuery, false);
      return;
    }
    focusMatch(findMatches, findMatchIndex + 1);
  }, [findMatches, findMatchIndex, focusMatch, runFind, findQuery]);

  const handleReplace = useCallback(() => {
    if (!findQuery) {
      setStatusText('请输入查找内容');
      return;
    }
    let matches = findMatches;
    let index = findMatchIndex;
    if (!matches.length) {
      matches = findInSheet(table, findQuery, findOptionsRef.current);
      setFindMatches(matches);
      if (!matches.length) {
        syncFindToStore([], 0, true);
        setStatusText('未找到匹配项');
        return;
      }
      index = 0;
    }
    const current = matches[index];
    const ok = replaceSheetMatch(table, current, findQuery, replaceQuery, findOptionsRef.current);
    if (!ok) {
      setStatusText('当前单元格无法替换');
      return;
    }
    const nextMatches = findInSheet(table, findQuery, findOptionsRef.current);
    setFindMatches(nextMatches);
    if (!nextMatches.length) {
      setFindMatchIndex(0);
      syncFindToStore([], 0, true);
      setStatusText('已替换，无更多匹配');
      return;
    }
    const nextIndex = Math.min(index, nextMatches.length - 1);
    focusMatch(nextMatches, nextIndex);
    setStatusText('已替换 1 处');
  }, [
    findQuery,
    replaceQuery,
    findMatches,
    findMatchIndex,
    table,
    syncFindToStore,
    setStatusText,
    focusMatch,
  ]);

  const handleReplaceAll = useCallback(() => {
    if (!findQuery) {
      setStatusText('请输入查找内容');
      return;
    }
    const count = replaceAllInSheet(table, findQuery, replaceQuery, findOptionsRef.current);
    const nextMatches = findInSheet(table, findQuery, findOptionsRef.current);
    setFindMatches(nextMatches);
    if (nextMatches.length) focusMatch(nextMatches, 0);
    else {
      setFindMatchIndex(0);
      syncFindToStore([], 0, true);
    }
    setStatusText(count > 0 ? `已全部替换 ${count} 处` : '未找到可替换项');
  }, [findQuery, replaceQuery, table, setStatusText, focusMatch, syncFindToStore]);

  const [, setFilterTick] = useState(0);
  const [freezeMenuOpen, setFreezeMenuOpen] = useState(false);
  useEffect(() => table.onChange(() => setFilterTick(v => v + 1)), [table]);

  // 表格数据变更时：仅在已有查找结果时刷新高亮
  useEffect(() => {
    if (!showFindReplace) return;
    return table.onChange(() => {
      if (!findQuery || findMatches.length === 0) return;
      const matches = findInSheet(table, findQuery, findOptionsRef.current);
      setFindMatches(matches);
      if (!matches.length) {
        setFindMatchIndex(0);
        syncFindToStore([], 0, true);
        return;
      }
      setFindMatchIndex(prev => {
        const idx = Math.min(prev, matches.length - 1);
        syncFindToStore(matches, idx, true);
        return idx;
      });
    });
  }, [table, showFindReplace, findQuery, findMatches.length, syncFindToStore]);

  const guardCell = useCallback((): boolean => {
    if (!activeCell) {
      setStatusText('请先选中单元格');
      return false;
    }
    return true;
  }, [activeCell, setStatusText]);

  const getSelectionCells = useCallback(() => {
    const sel = useSheetStore.getState().selectionRange;
    const cells: { row: number; col: number }[] = [];
    if (sel) {
      for (let r = sel.start.row; r <= sel.end.row; r++) {
        for (let c = sel.start.col; c <= sel.end.col; c++) {
          cells.push({ row: r, col: c });
        }
      }
    } else if (activeCell) {
      cells.push(activeCell);
    }
    return cells;
  }, [activeCell]);

  const applyStyle = useCallback((style: Record<string, unknown>) => {
    if (!guardCell()) return;
    for (const { row, col } of getSelectionCells()) {
      table.setCellStyle(row, col, style);
    }
    const cell = activeCell!;
    const s = table.getCell(cell.row, cell.col)?.style;
    if (style.bold !== undefined) setBoldActive(!!style.bold);
    else if (s?.bold !== undefined) setBoldActive(s.bold);
    if (style.italic !== undefined) setItalicActive(!!style.italic);
    else if (s?.italic !== undefined) setItalicActive(s.italic);
    if (style.underline !== undefined) setUnderlineActive(!!style.underline);
    else if (s?.underline !== undefined) setUnderlineActive(s.underline);
    if (style.strikethrough !== undefined) setStrikethroughActive(!!style.strikethrough);
    else if (s?.strikethrough !== undefined) setStrikethroughActive(s.strikethrough);
    if (style.fontSize !== undefined) setFontSize(style.fontSize as number);
    else if (s?.fontSize !== undefined) setFontSize(s.fontSize);
    if (style.fontFamily !== undefined) setFontFamily(style.fontFamily as string);
    else if (s?.fontFamily !== undefined) setFontFamily(s.fontFamily);
    if (style.fontColor !== undefined) setFontColor(style.fontColor as string);
    else if (s?.fontColor !== undefined) setFontColor(s.fontColor);
    if (style.backgroundColor !== undefined) setBackgroundColor(style.backgroundColor as string);
    else if (s?.backgroundColor !== undefined) setBackgroundColor(s.backgroundColor);
    if (style.horizontalAlign !== undefined) setHorizontalAlign(style.horizontalAlign as string);
    else if (s?.horizontalAlign !== undefined) setHorizontalAlign(s.horizontalAlign);
    if (style.verticalAlign !== undefined) setVerticalAlign(style.verticalAlign as string);
    else if (s?.verticalAlign !== undefined) setVerticalAlign(s.verticalAlign);
    if (style.textWrap !== undefined) setTextWrapActive(!!style.textWrap);
    else if (s?.textWrap !== undefined) setTextWrapActive(s.textWrap);
  }, [table, activeCell, guardCell, getSelectionCells, setBoldActive, setItalicActive, setUnderlineActive,
    setStrikethroughActive, setFontSize, setFontFamily, setFontColor, setBackgroundColor,
    setHorizontalAlign, setVerticalAlign, setTextWrapActive]);

  const applyBorderAppearanceToSelection = useCallback((color: string, lineStyle: BorderLineStyle): number => {
    if (!guardCell()) return 0;
    let updated = 0;
    for (const { row, col } of getSelectionCells()) {
      const style = table.getCell(row, col)?.style;
      const patch = patchExistingBorderSides(style, color, lineStyle);
      if (Object.keys(patch).length > 0) {
        table.setCellStyle(row, col, patch);
        updated++;
      }
    }
    return updated;
  }, [table, guardCell, getSelectionCells]);

  const handleBorderColorChange = useCallback((color: string) => {
    setBorderColor(color);
    const updated = applyBorderAppearanceToSelection(color, useSheetStore.getState().borderLineStyle);
    setStatusText(updated > 0 ? '已更新边框颜色' : '边框颜色已设置，请选择边框类型应用');
  }, [setBorderColor, applyBorderAppearanceToSelection, setStatusText]);

  const handleBorderLineStyleChange = useCallback((lineStyle: BorderLineStyle) => {
    setBorderLineStyle(lineStyle);
    const updated = applyBorderAppearanceToSelection(useSheetStore.getState().borderColor, lineStyle);
    if (updated > 0) setStatusText('已更新边框线型');
  }, [setBorderLineStyle, applyBorderAppearanceToSelection, setStatusText]);

  const applyBorder = useCallback((preset: BorderPreset) => {
    if (!guardCell()) return;
    const { borderColor: color, borderLineStyle: lineStyle } = useSheetStore.getState();
    const sel = useSheetStore.getState().selectionRange;
    const cells = getSelectionCells();
    const borderSide = createBorderSide(color, lineStyle);
    switch (preset) {
      case 'all':
        for (const c of cells) {
          table.setCellStyle(c.row, c.col, {
            borderTop: borderSide, borderRight: borderSide,
            borderBottom: borderSide, borderLeft: borderSide,
          });
        }
        break;
      case 'outer':
        if (sel) {
          for (const c of cells) {
            const s: Record<string, unknown> = {};
            if (c.row === sel.start.row) s.borderTop = borderSide;
            if (c.row === sel.end.row) s.borderBottom = borderSide;
            if (c.col === sel.start.col) s.borderLeft = borderSide;
            if (c.col === sel.end.col) s.borderRight = borderSide;
            if (Object.keys(s).length > 0) table.setCellStyle(c.row, c.col, s);
          }
        }
        break;
      case 'inner':
        if (sel) {
          for (const c of cells) {
            const s: Record<string, unknown> = {};
            if (c.row !== sel.start.row) s.borderTop = borderSide;
            if (c.row !== sel.end.row) s.borderBottom = borderSide;
            if (c.col !== sel.start.col) s.borderLeft = borderSide;
            if (c.col !== sel.end.col) s.borderRight = borderSide;
            if (Object.keys(s).length > 0) table.setCellStyle(c.row, c.col, s);
          }
        }
        break;
      case 'left': for (const c of cells) table.setCellStyle(c.row, c.col, { borderLeft: borderSide }); break;
      case 'right': for (const c of cells) table.setCellStyle(c.row, c.col, { borderRight: borderSide }); break;
      case 'top': for (const c of cells) table.setCellStyle(c.row, c.col, { borderTop: borderSide }); break;
      case 'bottom': for (const c of cells) table.setCellStyle(c.row, c.col, { borderBottom: borderSide }); break;
      case 'none':
        for (const c of cells) {
          table.setCellStyle(c.row, c.col, {
            borderTop: NONE_BORDER_SIDE,
            borderRight: NONE_BORDER_SIDE,
            borderBottom: NONE_BORDER_SIDE,
            borderLeft: NONE_BORDER_SIDE,
          });
        }
        break;
    }
    setStatusText('已应用边框');
  }, [table, guardCell, getSelectionCells, setStatusText]);

  const handleClearFormat = useCallback(() => {
    if (!guardCell()) return;
    // 使用 clearCellFormat 方法完全清除格式（将 style 设置为 undefined）
    for (const { row, col } of getSelectionCells()) {
      table.clearCellFormat(row, col);
    }
    setBoldActive(false);
    setItalicActive(false);
    setUnderlineActive(false);
    setStrikethroughActive(false);
    setTextWrapActive(false);
    setStatusText('已清除格式');
  }, [guardCell, getSelectionCells, table, setBoldActive, setItalicActive, setUnderlineActive,
    setStrikethroughActive, setTextWrapActive, setStatusText]);

  const handleFormatPainterClick = useCallback(() => {
    if (!guardCell()) return;
    const cell = activeCell!;
    const source = table.getCell(cell.row, cell.col)?.style || null;
    if (!source) {
      setStatusText('当前单元格没有格式可复制');
      return;
    }
    setFormatPainterActive(true, source, 'once');
    setStatusText('格式刷已启用，点击目标单元格粘贴格式');
  }, [table, activeCell, guardCell, setFormatPainterActive, setStatusText]);

  const handleFormatPainterDblClick = useCallback(() => {
    if (!guardCell()) return;
    const cell = activeCell!;
    const source = table.getCell(cell.row, cell.col)?.style || null;
    if (!source) {
      setStatusText('当前单元格没有格式可复制');
      return;
    }
    setFormatPainterActive(true, source, 'multi');
    setStatusText('格式刷已启用(多次模式)，按 ESC 退出');
  }, [table, activeCell, guardCell, setFormatPainterActive, setStatusText]);

  const handleNumberFormatChange = useCallback((fmt: string) => {
    setNumberFormat(fmt);
    if (!guardCell()) return;
    let applied = 0;
    table.runBatch(() => {
      for (const { row, col } of getSelectionCells()) {
        const cellData = table.getCell(row, col);
        const current = cellData?.value ?? { type: 'empty' as const };
        const next = applyFormatMenuKey(current, fmt);
        if (next) {
          table.setCellValue(row, col, next);
          applied++;
        }
      }
    }, 'setNumberFormat');
    setStatusText(applied > 0 ? '格式已应用' : '无法对当前内容应用该格式');
    if (activeCell) {
      const updated = table.getCell(activeCell.row, activeCell.col);
      useSheetStore.getState().setFormulaBarText(updated ? getEditText(updated.value) : '');
    }
  }, [activeCell, table, setNumberFormat, setStatusText, guardCell, getSelectionCells]);

  const adjustDecimals = useCallback((delta: number) => {
    if (!activeCell) return;
    const cd = table.getCell(activeCell.row, activeCell.col);
    if (cd?.value.type !== 'number') return;
    const fmt = cd.value.format;
    const currentDec = fmt.kind !== 'general' ? (fmt as { decimals?: number }).decimals ?? 2 : 2;
    const nextDec = Math.max(0, Math.min(10, currentDec + delta));
    if (fmt.kind === 'general') {
      table.setCellValue(activeCell.row, activeCell.col, { ...cd.value, format: { kind: 'fixed', decimals: nextDec } });
    } else {
      table.setCellValue(activeCell.row, activeCell.col, { ...cd.value, format: { ...fmt, decimals: nextDec } as typeof fmt });
    }
    useSheetStore.getState().setFormulaBarText(getEditText(table.getCell(activeCell.row, activeCell.col)!.value));
  }, [activeCell, table]);

  const handleMergeToggle = useCallback(() => {
    const cell = activeCell;
    if (cell) {
      const merged = table.isInMergedCell(cell.row, cell.col);
      if (merged) {
        table.unmergeCells(cell.row, cell.col);
        setStatusText('已拆分单元格');
        return;
      }
    }
    if (selectionRange && (selectionRange.start.row !== selectionRange.end.row || selectionRange.start.col !== selectionRange.end.col)) {
      try {
        table.mergeCells(selectionRange);
        setStatusText('已合并单元格');
      } catch {
        setStatusText('合并失败：区域冲突');
      }
      return;
    }
    setStatusText('请先选中多单元格区域');
  }, [table, activeCell, selectionRange, setStatusText]);

  const isInMerged = activeCell ? table.isInMergedCell(activeCell.row, activeCell.col) : null;
  const canMerge = selectionRange && (selectionRange.start.row !== selectionRange.end.row || selectionRange.start.col !== selectionRange.end.col);
  const mergeEnabled = !!isInMerged || !!canMerge;

  useEffect(() => {
    if (!formatPainterActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFormatPainterActive(false, null, 'once');
        setStatusText('已退出格式刷');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [formatPainterActive, setFormatPainterActive, setStatusText]);

  const prevActiveCellRef = React.useRef(activeCell);
  const painterModeRef = React.useRef(useSheetStore.getState().formatPainterMode);
  useEffect(() => { painterModeRef.current = useSheetStore.getState().formatPainterMode; });

  useEffect(() => {
    if (!formatPainterActive || !formatPainterSource || !activeCell) return;
    const prev = prevActiveCellRef.current;
    if (prev && prev.row === activeCell.row && prev.col === activeCell.col) return;
    prevActiveCellRef.current = activeCell;
    table.setCellStyle(activeCell.row, activeCell.col, formatPainterSource);
    setStatusText('格式已粘贴');
    if (painterModeRef.current === 'once') setFormatPainterActive(false, null, 'once');
  }, [activeCell, formatPainterActive, formatPainterSource, table, setFormatPainterActive, setStatusText]);

  useEffect(() => {
    if (!formatPainterActive) prevActiveCellRef.current = activeCell;
  }, [activeCell, formatPainterActive]);

  const stub = (name: string) => () => setStatusText(`${name}功能开发中`);

  return (
    <div
      data-sheet-keep-selection
      style={{
        display: 'flex',
        alignItems: 'stretch',
        padding: '4px 8px',
        borderBottom: '1px solid #e0e0e0',
        background: TOOLBAR_BG,
        gap: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        minHeight: 56,
        userSelect: 'none',
      }}
    >
      {/* 菜单 */}
      <ToolbarLabeledBtn
        showChevron
        label="菜单"
        icon={(
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        )}
        onClick={stub('菜单')}
      />

      {divider}

      {/* 撤销 / 重做 / 格式刷 / 清除格式 */}
      <ToolbarLabeledBtn
        label="撤销"
        icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        )}
        onClick={() => { table.undo(); setStatusText('已撤销'); }}
        shortcut={modShortcut('Z')}
      />
      <ToolbarLabeledBtn
        label="重做"
        icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        )}
        onClick={() => { table.redo(); setStatusText('已重做'); }}
        shortcut={redoShortcut()}
      />
      <ToolbarLabeledBtn
        label="格式刷"
        active={formatPainterActive}
        icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M18 2l3 3-12 12H6v-3L18 2z" /><path d="M3 21h7" />
          </svg>
        )}
        onClick={handleFormatPainterClick}
        onDoubleClick={handleFormatPainterDblClick}
      />
      <ToolbarLabeledBtn
        label="清除格式"
        icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 5H9l-3 3v11h14V5z" /><path d="M7 15l10-10" />
          </svg>
        )}
        onClick={handleClearFormat}
      />

      {divider}

      {/* 插入 */}
      <InsertDropdown table={table} onInsertChart={onInsertChart} />

      {divider}

      {/* 字体区：两行 */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '0 2px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ToolbarTooltip label="字体">
            <div style={{ transform: 'scale(0.92)', transformOrigin: 'left center' }}>
              <FontSelector value={currentFontFamily} onChange={v => applyStyle({ fontFamily: v })} />
            </div>
          </ToolbarTooltip>
          <ToolbarTooltip label="字号">
            <select
              value={currentFontSize}
              onChange={e => applyStyle({ fontSize: Number(e.target.value) })}
              style={{ ...selectStyle, width: 44 }}
            >
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </ToolbarTooltip>
          <ToolbarTooltip label="边框">
            <BorderPicker
              borderColor={borderColor}
              borderLineStyle={borderLineStyle}
              onBorderColorChange={handleBorderColorChange}
              onBorderLineStyleChange={handleBorderLineStyleChange}
              onApplyPreset={applyBorder}
              trigger={(
                <button type="button" style={{ ...selectStyle, display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 6px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="4" y="4" width="16" height="16" rx="1" />
                    <path d="M4 10h16M4 16h16M10 4v16M16 4v16" />
                  </svg>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.45 }}><path d="M7 10l5 5 5-5z" /></svg>
                </button>
              )}
            />
          </ToolbarTooltip>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AlignIconBtn title="加粗" shortcut={modShortcut('B')} active={boldActive} onClick={() => applyStyle({ bold: !boldActive })}><b>B</b></AlignIconBtn>
          <AlignIconBtn title="删除线" active={strikethroughActive} onClick={() => applyStyle({ strikethrough: !strikethroughActive })}><s>S</s></AlignIconBtn>
          <AlignIconBtn title="斜体" shortcut={modShortcut('I')} active={italicActive} onClick={() => applyStyle({ italic: !italicActive })}><i>I</i></AlignIconBtn>
          <AlignIconBtn title="下划线" shortcut={modShortcut('U')} active={underlineActive} onClick={() => applyStyle({ underline: !underlineActive })}><u>U</u></AlignIconBtn>
          <ToolbarTooltip label="字体颜色">
            <ColorPicker
              value={fontColor}
              onChange={c => applyStyle({ fontColor: c })}
              trigger={(
                <button type="button" style={{ ...iconBtnStyle(), width: 28, gap: 1, flexDirection: 'column' as const, height: 24 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1 }}>A</span>
                  <span style={{ width: 14, height: 3, background: fontColor, borderRadius: 1 }} />
                </button>
              )}
            />
          </ToolbarTooltip>
          <ToolbarTooltip label="填充颜色">
            <ColorPicker
              value={backgroundColor}
              onChange={c => applyStyle({ backgroundColor: c })}
              trigger={(
                <button type="button" style={{ ...iconBtnStyle(), width: 28, height: 24, position: 'relative' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M19 11H5M17 17H7M15 7H9" />
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                  </svg>
                  <span style={{ position: 'absolute', bottom: 2, width: 12, height: 2, background: backgroundColor === '#ffffff' ? '#ffc107' : backgroundColor }} />
                </button>
              )}
            />
          </ToolbarTooltip>
        </div>
      </div>

      {divider}

      {/* 对齐 + 合并 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, padding: '0 2px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 1 }}>
            <AlignIconBtn title="顶部对齐" active={verticalAlign === 'top'} onClick={() => applyStyle({ verticalAlign: 'top' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="2" /><rect x="8" y="8" width="8" height="10" opacity="0.35" /></svg>
            </AlignIconBtn>
            <AlignIconBtn title="垂直居中" active={verticalAlign === 'middle'} onClick={() => applyStyle({ verticalAlign: 'middle' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="11" width="16" height="2" /><rect x="8" y="6" width="8" height="12" opacity="0.35" /></svg>
            </AlignIconBtn>
            <AlignIconBtn title="底部对齐" active={verticalAlign === 'bottom'} onClick={() => applyStyle({ verticalAlign: 'bottom' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="18" width="16" height="2" /><rect x="8" y="6" width="8" height="10" opacity="0.35" /></svg>
            </AlignIconBtn>
          </div>
          <div style={{ display: 'flex', gap: 1 }}>
            <AlignIconBtn title="左对齐" active={horizontalAlign === 'left'} onClick={() => applyStyle({ horizontalAlign: 'left' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="2" height="16" /><rect x="8" y="7" width="10" height="3" opacity="0.35" /><rect x="8" y="13" width="7" height="3" opacity="0.35" /></svg>
            </AlignIconBtn>
            <AlignIconBtn title="居中" active={horizontalAlign === 'center'} onClick={() => applyStyle({ horizontalAlign: 'center' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="11" y="4" width="2" height="16" /><rect x="6" y="7" width="12" height="3" opacity="0.35" /><rect x="8" y="13" width="8" height="3" opacity="0.35" /></svg>
            </AlignIconBtn>
            <AlignIconBtn title="右对齐" active={horizontalAlign === 'right'} onClick={() => applyStyle({ horizontalAlign: 'right' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="18" y="4" width="2" height="16" /><rect x="6" y="7" width="10" height="3" opacity="0.35" /><rect x="9" y="13" width="7" height="3" opacity="0.35" /></svg>
            </AlignIconBtn>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 2 }}>
          <AlignIconBtn title="自动换行" active={textWrapActive} onClick={() => applyStyle({ textWrap: !textWrapActive })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h12M4 12h8M4 18h10" /><path d="M18 8l3 4-3 4" /></svg>
          </AlignIconBtn>
          <AlignIconBtn title="溢出" active={!textWrapActive} onClick={() => applyStyle({ textWrap: false })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h14M4 14h10" /></svg>
          </AlignIconBtn>
        </div>
        <ToolbarLabeledBtn
          label={isInMerged ? '拆分单元格' : '合并单元格'}
          disabled={!mergeEnabled}
          active={!!isInMerged}
          icon={(
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="5" y="5" width="14" height="14" rx="1" />
              <path d="M9 5v14M15 5v14M5 9h14M5 15h14" />
            </svg>
          )}
          onClick={handleMergeToggle}
        />
      </div>

      {divider}

      {/* 数字格式：两行（下拉 + 快捷按钮） */}
      <NumberFormatToolbar
        value={numberFormat}
        onChange={handleNumberFormatChange}
        onAdjustDecimals={adjustDecimals}
      />

      {divider}

      {/* 数据操作 */}
      <FreezeDropdown
        table={table}
        open={freezeMenuOpen}
        onOpenChange={setFreezeMenuOpen}
        trigger={(
          <ToolbarLabeledBtn
            showChevron
            label="冻结"
            active={freezeMenuOpen}
            icon={(
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="3" width="18" height="18" rx="1" />
                <path d="M3 9h18M9 3v18" />
                <rect x="4" y="4" width="4" height="4" fill="currentColor" stroke="none" opacity="0.3" />
              </svg>
            )}
            onClick={() => setFreezeMenuOpen(v => !v)}
          />
        )}
      />
      <ColumnFilterDropdown
        table={table}
        open={filterMenuOpen}
        onOpenChange={setFilterMenuOpen}
        trigger={(
          <ToolbarLabeledBtn
            showChevron
            label={filterEnabled && columnFilterCount > 0 ? `筛选 ${columnFilterCount}` : '筛选'}
            active={filterEnabled}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M7 12h10M10 18h4" /></svg>}
            onClick={() => setFilterMenuOpen(v => !v)}
          />
        )}
      />
      <ToolbarLabeledBtn showChevron label="排序" disabled icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 6h12M8 12h8M8 18h4" /><path d="M4 6v12M4 6l-2 2M4 18l-2-2" /></svg>} onClick={stub('排序')} />
      <ToolbarLabeledBtn showChevron label="条件格式" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="8" height="8" fill="#4caf50" stroke="none" /><rect x="13" y="3" width="8" height="8" fill="#ff9800" stroke="none" /><rect x="3" y="13" width="8" height="8" fill="#2196f3" stroke="none" /><rect x="13" y="13" width="8" height="8" fill="#e91e63" stroke="none" /></svg>} onClick={stub('条件格式')} />
      <ToolbarLabeledBtn showChevron label="下拉列表" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M8 10h8M8 14h5" /></svg>} onClick={stub('下拉列表')} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <ToolbarTooltip label="公式">
          <FormulaDropdown table={table} />
        </ToolbarTooltip>
        <span style={labelStyle}>公式</span>
      </div>

      {divider}

      {/* 高级功能 */}
      <div
        ref={findReplaceAnchorRef}
        style={{ display: 'flex', alignItems: 'center', alignSelf: 'stretch', flexShrink: 0 }}
      >
        <ToolbarLabeledBtn
          label="查找和替换"
          active={showFindReplace}
          shortcut={modShortcut('F')}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L20 20" /></svg>}
          onClick={() => {
            if (showFindReplace) closeFindReplace();
            else openFindReplace();
          }}
        />
      </div>
      {commentsEnabled && (
        <ToolbarLabeledBtn
          label="评论"
          active={commentPanelOpen}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>}
          onClick={onToggleCommentPanel}
        />
      )}
      <ToolbarLabeledBtn label="AI 写公式" icon={<span style={{ fontSize: 11, fontWeight: 700, color: ACTIVE_COLOR }}>AI</span>} onClick={stub('AI 写公式')} />

      <SheetFindReplacePanel
        open={showFindReplace}
        findQuery={findQuery}
        replaceQuery={replaceQuery}
        matchIndex={findMatchIndex}
        matchCount={findMatches.length}
        caseSensitive={caseSensitive}
        matchEntireCell={matchEntireCell}
        anchorRef={findReplaceAnchorRef}
        onFindQueryChange={handleFindQueryChange}
        onReplaceQueryChange={setReplaceQuery}
        onCaseSensitiveChange={(v) => {
          setCaseSensitive(v);
          clearFindResults();
        }}
        onMatchEntireCellChange={(v) => {
          setMatchEntireCell(v);
          clearFindResults();
        }}
        onClose={closeFindReplace}
        onPrev={handleFindPrev}
        onNext={handleFindNext}
        onFind={() => runFind(findQuery, findMatches.length > 0)}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
      />
    </div>
  );
};
