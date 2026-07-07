import React, { useCallback, useEffect, useState } from 'react';
import { useSheetStore } from '../../store/sheetStore';
import { ColorPicker } from './ColorPicker';
import { AlignmentPicker } from './AlignmentPicker';
import { FontSelector } from './FontSelector';
import { NumberFormatToolbar } from './NumberFormatToolbar';
import { FormulaDropdown } from './FormulaDropdown';
import { ToolbarTooltip, modShortcut, redoShortcut } from './Tooltip';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { FreezeDropdown } from './FreezeDropdown';
import { InsertDropdown } from './InsertDropdown';
import type { FreeTable } from '@lingyi-doc/core';
import { applyFormatMenuKey, getEditText, DEFAULT_CELL_STYLE, getFilteredColumnIndices } from '@lingyi-doc/core';

interface ToolbarProps {
  table: FreeTable;
  onInsertChart?: () => void;
}

const TOOLBAR_BG = '#f3f4f5';
const ACTIVE_COLOR = '#1a73e8';
const ICON_COLOR = '#444';
const LABEL_COLOR = '#666';

const divider = (
  <div style={{ width: 1, height: 44, background: '#dcdcdc', margin: '0 6px', flexShrink: 0 }} />
);

const BORDER_PRESETS = [
  { value: 'all', label: '所有边框', icon: '▦' },
  { value: 'outer', label: '外侧框线', icon: '▣' },
  { value: 'inner', label: '内侧框线', icon: '═' },
  { value: 'left', label: '左侧框线', icon: '├' },
  { value: 'right', label: '右侧框线', icon: '┤' },
  { value: 'top', label: '顶部框线', icon: '┬' },
  { value: 'bottom', label: '底部框线', icon: '┴' },
  { value: 'none', label: '无框线', icon: '○' },
];

const DEFAULT_BORDER_STYLE = { color: '#000000', style: 'thin' as const };
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

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

export const Toolbar: React.FC<ToolbarProps> = ({ table, onInsertChart }) => {
  const boldActive = useSheetStore(s => s.boldActive);
  const italicActive = useSheetStore(s => s.italicActive);
  const underlineActive = useSheetStore(s => s.underlineActive);
  const strikethroughActive = useSheetStore(s => s.strikethroughActive);
  const currentFontSize = useSheetStore(s => s.currentFontSize);
  const currentFontFamily = useSheetStore(s => s.currentFontFamily);
  const fontColor = useSheetStore(s => s.fontColor);
  const backgroundColor = useSheetStore(s => s.backgroundColor);
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
  const setHorizontalAlign = useSheetStore(s => s.setHorizontalAlign);
  const setVerticalAlign = useSheetStore(s => s.setVerticalAlign);
  const setTextWrapActive = useSheetStore(s => s.setTextWrapActive);
  const setNumberFormat = useSheetStore(s => s.setNumberFormat);
  const setFormatPainterActive = useSheetStore(s => s.setFormatPainterActive);
  const setStatusText = useSheetStore(s => s.setStatusText);

  const [, setFilterTick] = useState(0);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [freezeMenuOpen, setFreezeMenuOpen] = useState(false);
  useEffect(() => table.onChange(() => setFilterTick(v => v + 1)), [table]);
  const filterEnabled = table.isColumnFilterEnabled();
  const columnFilterCount = getFilteredColumnIndices(table.sheet.columnFilters ?? []).length;

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

  const applyBorder = useCallback((preset: string) => {
    if (!guardCell()) return;
    const sel = useSheetStore.getState().selectionRange;
    const cells = getSelectionCells();
    switch (preset) {
      case 'all':
        for (const c of cells) {
          table.setCellStyle(c.row, c.col, {
            borderTop: DEFAULT_BORDER_STYLE, borderRight: DEFAULT_BORDER_STYLE,
            borderBottom: DEFAULT_BORDER_STYLE, borderLeft: DEFAULT_BORDER_STYLE,
          });
        }
        break;
      case 'outer':
        if (sel) {
          for (const c of cells) {
            const s: Record<string, unknown> = {};
            if (c.row === sel.start.row) s.borderTop = DEFAULT_BORDER_STYLE;
            if (c.row === sel.end.row) s.borderBottom = DEFAULT_BORDER_STYLE;
            if (c.col === sel.start.col) s.borderLeft = DEFAULT_BORDER_STYLE;
            if (c.col === sel.end.col) s.borderRight = DEFAULT_BORDER_STYLE;
            if (Object.keys(s).length > 0) table.setCellStyle(c.row, c.col, s);
          }
        }
        break;
      case 'inner':
        if (sel) {
          for (const c of cells) {
            const s: Record<string, unknown> = {};
            if (c.row !== sel.start.row) s.borderTop = DEFAULT_BORDER_STYLE;
            if (c.row !== sel.end.row) s.borderBottom = DEFAULT_BORDER_STYLE;
            if (c.col !== sel.start.col) s.borderLeft = DEFAULT_BORDER_STYLE;
            if (c.col !== sel.end.col) s.borderRight = DEFAULT_BORDER_STYLE;
            if (Object.keys(s).length > 0) table.setCellStyle(c.row, c.col, s);
          }
        }
        break;
      case 'left': for (const c of cells) table.setCellStyle(c.row, c.col, { borderLeft: DEFAULT_BORDER_STYLE }); break;
      case 'right': for (const c of cells) table.setCellStyle(c.row, c.col, { borderRight: DEFAULT_BORDER_STYLE }); break;
      case 'top': for (const c of cells) table.setCellStyle(c.row, c.col, { borderTop: DEFAULT_BORDER_STYLE }); break;
      case 'bottom': for (const c of cells) table.setCellStyle(c.row, c.col, { borderBottom: DEFAULT_BORDER_STYLE }); break;
      case 'none':
        for (const c of cells) {
          table.setCellStyle(c.row, c.col, {
            borderTop: { color: '#000', style: 'none' },
            borderRight: { color: '#000', style: 'none' },
            borderBottom: { color: '#000', style: 'none' },
            borderLeft: { color: '#000', style: 'none' },
          } as Record<string, unknown>);
        }
        break;
    }
    setStatusText('已应用边框');
  }, [table, guardCell, getSelectionCells, setStatusText]);

  const handleClearFormat = useCallback(() => {
    if (!guardCell()) return;
    const resetStyle = { ...DEFAULT_CELL_STYLE };
    for (const { row, col } of getSelectionCells()) {
      table.setCellStyle(row, col, resetStyle);
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
            <AlignmentPicker
              value=""
              onChange={applyBorder}
              options={BORDER_PRESETS}
              trigger={(
                <button type="button" style={{ ...selectStyle, display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 6px' }}>
                  <span style={{ fontSize: 14 }}>▦</span>
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
      <ToolbarLabeledBtn showChevron label="多维表格" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="8" /><rect x="3" y="13" width="8" height="8" /><rect x="13" y="13" width="8" height="8" /></svg>} onClick={stub('多维表格')} />
      <ToolbarLabeledBtn label="查找和替换" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L20 20" /></svg>} onClick={stub('查找和替换')} />
      <ToolbarLabeledBtn label="评论" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>} onClick={stub('评论')} />
      <ToolbarLabeledBtn label="AI 写公式" icon={<span style={{ fontSize: 11, fontWeight: 700, color: ACTIVE_COLOR }}>AI</span>} onClick={stub('AI 写公式')} />
    </div>
  );
};
